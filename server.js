import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Redis } from '@upstash/redis';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Configuration Redis/KV
let redis;
let useRedis = false;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  useRedis = true;
  console.log('Redis (Upstash) activé ✅');
} else {
  console.log('⚠️ Mode local activé (Map) - Configurez Redis pour la production');
}

// Fallback Map pour développement local
const tournaments = new Map();

// Helper functions pour le stockage
async function getTournament(id) {
  if (useRedis) {
    const data = await redis.get(`tournament:${id}`);
    return data;
  }
  return tournaments.get(id);
}

async function getAllTournaments() {
  if (useRedis) {
    const keys = await redis.keys('tournament:*');
    const tournamentKeys = keys.filter(k => !k.includes(':code:'));
    const allTournaments = await Promise.all(
      tournamentKeys.map(key => redis.get(key))
    );
    return allTournaments.filter(t => t?.id);
  }
  return Array.from(tournaments.values());
}

async function deleteTournament(id) {
  if (useRedis) {
    const tournament = await redis.get(`tournament:${id}`);
    if (tournament) {
      await redis.del(`tournament:${id}`);
      await redis.del(`tournament:code:${tournament.code}`);
      if (tournament.isPublic) {
        await redis.srem('tournaments:public', id);
      }
    }
  } else {
    tournaments.delete(id);
  }
}

async function setTournament(id, data) {
  if (useRedis) {
    await redis.set(`tournament:${id}`, data);
    // Ajouter à la liste des tournois publics si nécessaire
    if (data.isPublic) {
      await redis.sadd('tournaments:public', id);
    }
  } else {
    tournaments.set(id, data);
  }
}

async function getPublicTournaments() {
  if (useRedis) {
    const ids = await redis.smembers('tournaments:public');
    const tournamentsData = await Promise.all(
      ids.map(id => redis.get(`tournament:${id}`))
    );
    return tournamentsData.filter(t => t?.status === 'open');
  }
  return Array.from(tournaments.values()).filter(t => t.isPublic && t.status === 'open');
}

async function getTournamentByCode(code) {
  if (useRedis) {
    const id = await redis.get(`tournament:code:${code}`);
    if (id) {
      return await redis.get(`tournament:${id}`);
    }
    return null;
  }
  return Array.from(tournaments.values()).find(t => t.code === code.toUpperCase());
}

function generateCode() {
  // Exclure les caractères ambigus : I, O, 0, 1 (confusion avec l, o)
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

app.post('/api/tournament/create', async (req, res) => {
  const { name, maxPlayers, teamSize, region, isPublic, balanceMode, creatorId } = req.body;
  
  // Vérifier que le nom est unique
  const allTournaments = await getAllTournaments();
  const nameExists = allTournaments.some(t => 
    t.name.toLowerCase().trim() === name.toLowerCase().trim()
  );
  
  if (nameExists) {
    return res.status(400).json({ 
      error: 'Un tournoi avec ce nom existe déjà. Choisissez un nom différent.' 
    });
  }
  
  // Vérifier que le créateur n'a pas plus de 2 tournois actifs
  if (creatorId) {
    const creatorTournaments = allTournaments.filter(t => 
      t.creatorId === creatorId && t.status !== 'deleted'
    );
    
    if (creatorTournaments.length >= 2) {
      return res.status(400).json({ 
        error: 'Vous avez déjà 2 tournois actifs. Attendez qu\'ils se terminent ou supprimez-en un.' 
      });
    }
  }
  
  const id = Date.now().toString();
  const code = generateCode();
  
  const tournamentData = {
    id,
    code,
    name,
    maxPlayers: Number.parseInt(maxPlayers),
    teamSize: Number.parseInt(teamSize),
    region,
    isPublic,
    balanceMode,
    registrations: [],
    teams: [],
    status: 'open',
    createdAt: Date.now(),
    creatorId: creatorId || null,
    teamsGeneratedAt: null
  };
  
  await setTournament(id, tournamentData);
  
  // Stocker le mapping code -> id
  if (useRedis) {
    await redis.set(`tournament:code:${code}`, id);
  }
  
  res.json({ id, code });
});

app.get('/api/tournaments/public', async (req, res) => {
  const allTournaments = await getPublicTournaments();
  const publicTournaments = allTournaments.map(t => ({
    id: t.id,
    code: t.code,
    name: t.name,
    maxPlayers: t.maxPlayers,
    teamSize: t.teamSize,
    currentPlayers: t.registrations.length,
    region: t.region,
    balanceMode: t.balanceMode
  }));
  
  res.json(publicTournaments);
});

app.get('/api/tournament/code/:code', async (req, res) => {
  const { code } = req.params;
  const tournament = await getTournamentByCode(code.toUpperCase());
  
  if (!tournament) {
    return res.status(404).json({ error: 'Code invalide' });
  }
  
  res.json({ id: tournament.id });
});

app.post('/api/tournament/:id/register', async (req, res) => {
  const { id } = req.params;
  const { displayName, epicId, mmr } = req.body;
  
  const tournament = await getTournament(id);
  
  if (!tournament) {
    return res.status(404).json({ error: 'Tournoi introuvable' });
  }
  
  if (tournament.status !== 'open') {
    return res.status(400).json({ error: 'Inscriptions fermées' });
  }
  
  if (tournament.registrations.length >= tournament.maxPlayers) {
    return res.status(400).json({ error: 'Tournoi complet' });
  }
  
  if (tournament.registrations.some(p => p.epicId === epicId || p.epicId.toLowerCase() === epicId.toLowerCase())) {
    return res.status(400).json({ error: 'Vous êtes déjà inscrit à ce tournoi' });
  }
  
  // Validation du MMR
  const playerMMR = Number.parseInt(mmr);
  if (Number.isNaN(playerMMR) || playerMMR < 0 || playerMMR > 3000) {
    return res.status(400).json({ error: 'MMR invalide (doit être entre 0 et 3000)' });
  }
  
  try {
    tournament.registrations.push({
      displayName,
      epicId,
      mmr: playerMMR,
      timestamp: Date.now()
    });
    
    await setTournament(id, tournament);
    
    res.json({ success: true, mmr: playerMMR });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



app.post('/api/tournament/:id/generate', async (req, res) => {
  const { id } = req.params;
  const tournament = await getTournament(id);
  
  if (!tournament) {
    return res.status(404).json({ error: 'Tournoi introuvable' });
  }
  
  let players = [...tournament.registrations];
  let removedPlayers = [];
  
  const remainder = players.length % tournament.teamSize;
  if (remainder !== 0) {
    if (tournament.balanceMode === 'balanced') {
      const avgMMR = players.reduce((sum, p) => sum + p.mmr, 0) / players.length;
      for (let i = 0; i < remainder; i++) {
        const outlierIndex = players.reduce((maxIdx, p, idx, arr) => 
          Math.abs(p.mmr - avgMMR) > Math.abs(arr[maxIdx].mmr - avgMMR) ? idx : maxIdx
        , 0);
        removedPlayers.push(players.splice(outlierIndex, 1)[0]);
      }
    } else {
      for (let i = 0; i < remainder; i++) {
        removedPlayers.push(players.splice(Math.floor(Math.random() * players.length), 1)[0]);
      }
    }
  }
  
  const teams = tournament.balanceMode === 'balanced' 
    ? balanceTeams(players, tournament.teamSize) 
    : randomTeams(players, tournament.teamSize);
    
  tournament.teams = teams;
  tournament.status = 'generated';
  tournament.removedPlayers = removedPlayers;
  tournament.teamsGeneratedAt = Date.now();
  
  await setTournament(id, tournament);
  
  res.json({ success: true, teams, removedPlayers });
});

// Supprimer un joueur inscrit (créateur uniquement)
app.delete('/api/tournament/:id/player/:epicId', async (req, res) => {
  const { id, epicId } = req.params;
  const tournament = await getTournament(id);
  
  if (!tournament) {
    return res.status(404).json({ error: 'Tournoi introuvable' });
  }
  
  if (tournament.status !== 'open') {
    return res.status(400).json({ error: 'Les inscriptions sont fermées' });
  }
  
  const playerIndex = tournament.registrations.findIndex(
    p => p.epicId.toLowerCase() === epicId.toLowerCase()
  );
  
  if (playerIndex === -1) {
    return res.status(404).json({ error: 'Joueur non trouvé' });
  }
  
  const removedPlayer = tournament.registrations.splice(playerIndex, 1)[0];
  await setTournament(id, tournament);
  res.json({ success: true, player: removedPlayer });
});

// Assigner un joueur à une équipe pré-définie (créateur uniquement)
app.post('/api/tournament/:id/player/:epicId/assign', async (req, res) => {
  const { id, epicId } = req.params;
  const { teamNumber } = req.body;
  const tournament = await getTournament(id);
  
  if (!tournament) {
    return res.status(404).json({ error: 'Tournoi introuvable' });
  }
  
  if (tournament.status !== 'open') {
    return res.status(400).json({ error: 'Les inscriptions sont fermées' });
  }
  
  const player = tournament.registrations.find(
    p => p.epicId.toLowerCase() === epicId.toLowerCase()
  );
  
  if (!player) {
    return res.status(404).json({ error: 'Joueur non trouvé' });
  }
  
  // Assigner le joueur à une équipe (ou retirer l'assignation si teamNumber est null)
  if (teamNumber === null || teamNumber === undefined) {
    delete player.preAssignedTeam;
  } else {
    player.preAssignedTeam = Number.parseInt(teamNumber);
  }
  
  await setTournament(id, tournament);
  
  res.json({ success: true, player });
});

// Modifier le MMR d'un joueur (créateur uniquement)
app.post('/api/tournament/:id/player/:epicId/mmr', async (req, res) => {
  const { id, epicId } = req.params;
  const { mmr } = req.body;
  const tournament = await getTournament(id);
  
  if (!tournament) {
    return res.status(404).json({ error: 'Tournoi introuvable' });
  }
  
  if (tournament.status !== 'open') {
    return res.status(400).json({ error: 'Impossible de modifier le MMR après génération des équipes' });
  }
  
  const player = tournament.registrations.find(
    p => p.epicId.toLowerCase() === epicId.toLowerCase()
  );
  
  if (!player) {
    return res.status(404).json({ error: 'Joueur non trouvé' });
  }
  
  // Validation du MMR
  const newMMR = Number.parseInt(mmr);
  if (Number.isNaN(newMMR) || newMMR < 0 || newMMR > 3000) {
    return res.status(400).json({ error: 'MMR invalide (doit être entre 0 et 3000)' });
  }
  
  player.mmr = newMMR;
  
  await setTournament(id, tournament);
  
  res.json({ success: true, player });
});

function balanceTeams(players, teamSize) {
  const numTeams = Math.floor(players.length / teamSize);
  
  // Créer les équipes vides
  const teams = Array.from({ length: numTeams }, (_, i) => ({
    teamNumber: i + 1,
    players: []
  }));
  
  // Séparer les joueurs assignés manuellement des autres
  const assignedPlayers = players.filter(p => p.preAssignedTeam);
  const unassignedPlayers = players.filter(p => !p.preAssignedTeam);
  
  // Placer d'abord les joueurs avec assignation manuelle
  assignedPlayers.forEach(player => {
    const teamIndex = player.preAssignedTeam - 1; // Convertir 1-based en 0-based
    if (teamIndex >= 0 && teamIndex < numTeams) {
      teams[teamIndex].players.push(player);
    }
  });
  
  // Trier les joueurs non assignés par MMR
  const sorted = [...unassignedPlayers].sort((a, b) => b.mmr - a.mmr);
  
  // Distribuer les joueurs non assignés avec snake draft
  sorted.forEach((player, i) => {
    // Trouver l'équipe avec le moins de joueurs
    const teamsSorted = [...teams].sort((a, b) => a.players.length - b.players.length);
    
    // Si plusieurs équipes ont le même nombre, choisir celle avec le MMR total le plus faible
    const minPlayers = teamsSorted[0].players.length;
    const candidateTeams = teamsSorted.filter(t => t.players.length === minPlayers);
    
    const targetTeam = candidateTeams.reduce((minTeam, team) => {
      const teamMMR = team.players.reduce((sum, p) => sum + p.mmr, 0);
      const minTeamMMR = minTeam.players.reduce((sum, p) => sum + p.mmr, 0);
      return teamMMR < minTeamMMR ? team : minTeam;
    }, candidateTeams[0]);
    
    targetTeam.players.push(player);
  });
  
  // Calculer le MMR moyen de chaque équipe
  teams.forEach(team => {
    team.avgMMR = Math.round(team.players.reduce((sum, p) => sum + p.mmr, 0) / team.players.length);
  });
  
  return teams;
}

function randomTeams(players, teamSize) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const teams = [];
  const numTeams = Math.floor(shuffled.length / teamSize);
  
  for (let i = 0; i < numTeams; i++) {
    const team = {
      teamNumber: i + 1,
      players: shuffled.slice(i * teamSize, (i + 1) * teamSize)
    };
    team.avgMMR = Math.round(team.players.reduce((sum, p) => sum + p.mmr, 0) / teamSize);
    teams.push(team);
  }
  
  return teams;
}

app.get('/api/tournament/:id', async (req, res) => {
  const { id } = req.params;
  const { isCreator } = req.query;
  const tournament = await getTournament(id);
  
  if (!tournament) {
    return res.status(404).json({ error: 'Tournoi introuvable' });
  }
  
  // Si ce n'est pas le créateur, masquer les MMR
  if (isCreator !== 'true') {
    const publicData = { ...tournament };
    publicData.registrations = publicData.registrations.map(p => ({
      displayName: p.displayName,
      epicId: p.epicId,
      timestamp: p.timestamp
    }));
    if (publicData.teams.length > 0) {
      publicData.teams = publicData.teams.map(t => ({
        ...t,
        players: t.players.map(p => ({
          displayName: p.displayName,
          epicId: p.epicId
        }))
      }));
    }
    return res.json(publicData);
  }
  
  res.json(tournament);
});

app.post('/api/tournament/:id/update-teams', async (req, res) => {
  const { id } = req.params;
  const { teams } = req.body;
  const tournament = await getTournament(id);
  
  if (!tournament) {
    return res.status(404).json({ error: 'Tournoi introuvable' });
  }
  
  tournament.teams = teams;
  tournament.status = 'generated';
  if (!tournament.teamsGeneratedAt) {
    tournament.teamsGeneratedAt = Date.now();
  }
  
  await setTournament(id, tournament);
  
  res.json({ success: true });
});

// Routes pour servir les pages HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/create.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'create.html'));
});

app.get('/browse.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'browse.html'));
});

app.get('/tournament.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tournament.html'));
});

app.get('/overlay.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

// Fonction de nettoyage automatique des tournois
async function cleanupTournaments() {
  const now = Date.now();
  const allTournaments = await getAllTournaments();
  
  for (const tournament of allTournaments) {
    if (!tournament || tournament.status === 'deleted') continue;
    
    // Supprimer les tournois avec équipes générées depuis plus de 15 min
    if (tournament.teamsGeneratedAt && tournament.status === 'generated') {
      const timeSinceGeneration = now - tournament.teamsGeneratedAt;
      if (timeSinceGeneration > 15 * 60 * 1000) { // 15 minutes
        console.log(`🗑️ Suppression du tournoi "${tournament.name}" (équipes générées il y a ${Math.round(timeSinceGeneration / 60000)} min)`);
        await deleteTournament(tournament.id);
        continue;
      }
    }
    
    // Supprimer les tournois sans équipes générées depuis plus de 30 min
    if (!tournament.teamsGeneratedAt && tournament.status === 'open') {
      const timeSinceCreation = now - tournament.createdAt;
      if (timeSinceCreation > 30 * 60 * 1000) { // 30 minutes
        console.log(`🗑️ Suppression du tournoi "${tournament.name}" (créé il y a ${Math.round(timeSinceCreation / 60000)} min sans équipes)`);
        await deleteTournament(tournament.id);
      }
    }
  }
}

// Lancer le nettoyage toutes les 2 minutes
setInterval(cleanupTournaments, 2 * 60 * 1000);

// Export pour Vercel (serverless)
export default app;

// Démarrage local uniquement (pas sur Vercel)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`RLMatchup server on port ${PORT}`));
}
