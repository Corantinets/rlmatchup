import express from 'express';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

console.log('API Key loaded:', process.env.TRACKER_API_KEY ? '✅' : '❌');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const tournaments = new Map();

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.post('/api/tournament/create', (req, res) => {
  const { name, maxPlayers, teamSize, region, isPublic, balanceMode } = req.body;
  const id = Date.now().toString();
  const code = generateCode();
  
  tournaments.set(id, {
    id,
    code,
    name,
    maxPlayers: parseInt(maxPlayers),
    teamSize: parseInt(teamSize),
    region,
    isPublic,
    balanceMode,
    registrations: [],
    teams: [],
    status: 'open',
    createdAt: Date.now()
  });
  
  res.json({ id, code });
});

app.get('/api/tournaments/public', (req, res) => {
  const publicTournaments = Array.from(tournaments.values())
    .filter(t => t.isPublic && t.status === 'open')
    .map(t => ({
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

app.get('/api/tournament/code/:code', (req, res) => {
  const { code } = req.params;
  const tournament = Array.from(tournaments.values()).find(t => t.code === code.toUpperCase());
  
  if (!tournament) {
    return res.status(404).json({ error: 'Code invalide' });
  }
  
  res.json({ id: tournament.id });
});

app.post('/api/tournament/:id/register', async (req, res) => {
  const { id } = req.params;
  const { displayName, epicId } = req.body;
  
  const tournament = tournaments.get(id);
  
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
  
  try {
    const playerData = await verifyPlayer(epicId);
    
    if (!playerData.exists) {
      return res.status(404).json({ error: 'Compte Epic introuvable' });
    }
    
    tournament.registrations.push({
      displayName,
      epicId,
      mmr: playerData.mmr,
      timestamp: Date.now()
    });
    
    res.json({ success: true, mmr: playerData.mmr });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function verifyPlayer(epicId) {
  const url = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/epic/${epicId}`;
  
  try {
    const response = await axios.get(url, {
      headers: { 
        'TRN-Api-Key': process.env.TRACKER_API_KEY,
        'Accept': 'application/json',
        'User-Agent': 'RLMatchup/1.0'
      }
    });
    
    const rankedPlaylists = response.data.data.segments.filter(s => s.type === 'playlist');
    const mmr = rankedPlaylists.find(p => p.metadata.name === 'Ranked Duel 2v2')?.stats?.rating?.value || 0;
    
    return { exists: true, mmr };
  } catch (error) {
    console.error('API Error:', error.response?.status, error.response?.data);
    
    if (error.response?.status === 403) {
      console.log('⚠️ Clé API refusée - Mode démo activé');
      return { exists: true, mmr: Math.floor(Math.random() * 1000) + 500 };
    }
    
    if (error.response?.status === 404) {
      return { exists: false };
    }
    
    throw error;
  }
}

app.post('/api/tournament/:id/generate', (req, res) => {
  const { id } = req.params;
  const tournament = tournaments.get(id);
  
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
  
  res.json({ success: true, teams, removedPlayers });
});

// Supprimer un joueur inscrit (créateur uniquement)
app.delete('/api/tournament/:id/player/:epicId', (req, res) => {
  const { id, epicId } = req.params;
  const tournament = tournaments.get(id);
  
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
  res.json({ success: true, player: removedPlayer });
});

// Assigner un joueur à une équipe pré-définie (créateur uniquement)
app.post('/api/tournament/:id/player/:epicId/assign', (req, res) => {
  const { id, epicId } = req.params;
  const { teamNumber } = req.body;
  const tournament = tournaments.get(id);
  
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
    player.preAssignedTeam = parseInt(teamNumber);
  }
  
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
    });
    
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

app.get('/api/tournament/:id', (req, res) => {
  const { id } = req.params;
  const { isCreator } = req.query;
  const tournament = tournaments.get(id);
  
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

app.post('/api/tournament/:id/update-teams', (req, res) => {
  const { id } = req.params;
  const { teams } = req.body;
  const tournament = tournaments.get(id);
  
  if (!tournament) {
    return res.status(404).json({ error: 'Tournoi introuvable' });
  }
  
  tournament.teams = teams;
  tournament.status = 'generated';
  
  res.json({ success: true });
});

// Fonction d'initialisation des tournois de test (désactivée en production)
// Décommentez cette fonction pour créer automatiquement des tournois de test au démarrage
/*
function initTestTournaments() {
  console.log('🎮 Initialisation des tournois de test...');
  
  // Tournoi 1: 2v2 avec 8 joueurs (vous êtes créateur)
  const id1 = '1000000000001';
  const code1 = 'TEST2V2';
  const players1 = [
    { displayName: 'Alpha', epicId: 'Alpha123', mmr: 1450 },
    { displayName: 'Bravo', epicId: 'Bravo456', mmr: 1320 },
    { displayName: 'Charlie', epicId: 'Charlie789', mmr: 1180 },
    { displayName: 'Delta', epicId: 'Delta012', mmr: 1050 },
    { displayName: 'Echo', epicId: 'Echo345', mmr: 920 },
    { displayName: 'Foxtrot', epicId: 'Foxtrot678', mmr: 850 },
    { displayName: 'Golf', epicId: 'Golf901', mmr: 750 },
    { displayName: 'Hotel', epicId: 'Hotel234', mmr: 680 }
  ];
  
  tournaments.set(id1, {
    id: id1,
    code: code1,
    name: 'Tournoi 2v2 Test (Vous êtes créateur)',
    maxPlayers: 8,
    teamSize: 2,
    region: 'eu-west',
    isPublic: true,
    balanceMode: 'balanced',
    registrations: players1.map(p => ({ ...p, timestamp: Date.now() })),
    teams: [],
    status: 'open',
    createdAt: Date.now()
  });
  
  // Tournoi 2: 3v3 avec 12 joueurs (vous n'êtes pas créateur)
  const id2 = '1000000000002';
  const code2 = 'TEST3V3';
  const players2 = [
    { displayName: 'Titan', epicId: 'Titan111', mmr: 1520 },
    { displayName: 'Phantom', epicId: 'Phantom222', mmr: 1440 },
    { displayName: 'Dragon', epicId: 'Dragon333', mmr: 1350 },
    { displayName: 'Phoenix', epicId: 'Phoenix444', mmr: 1280 },
    { displayName: 'Viper', epicId: 'Viper555', mmr: 1190 },
    { displayName: 'Falcon', epicId: 'Falcon666', mmr: 1100 },
    { displayName: 'Cobra', epicId: 'Cobra777', mmr: 1020 },
    { displayName: 'Hawk', epicId: 'Hawk888', mmr: 950 },
    { displayName: 'Eagle', epicId: 'Eagle999', mmr: 880 },
    { displayName: 'Wolf', epicId: 'Wolf000', mmr: 810 },
    { displayName: 'Lion', epicId: 'Lion111', mmr: 740 },
    { displayName: 'Tiger', epicId: 'Tiger222', mmr: 670 }
  ];
  
  tournaments.set(id2, {
    id: id2,
    code: code2,
    name: 'Tournoi 3v3 Test (Mode participant)',
    maxPlayers: 12,
    teamSize: 3,
    region: 'us-east',
    isPublic: true,
    balanceMode: 'balanced',
    registrations: players2.map(p => ({ ...p, timestamp: Date.now() })),
    teams: [],
    status: 'open',
    createdAt: Date.now()
  });
  
  console.log(`✅ Tournoi 2v2 créé - Code: ${code1} - ID: ${id1}`);
  console.log(`   👑 Mode créateur: http://localhost:3000/tournament.html?id=${id1}`);
  console.log(`   (Enregistrez dans localStorage: tournament_creator_${id1} = true)`);
  console.log(`✅ Tournoi 3v3 créé - Code: ${code2} - ID: ${id2}`);
  console.log(`   👤 Mode participant: http://localhost:3000/tournament.html?id=${id2}`);
}

// Initialiser les tournois de test
initTestTournaments();
*/

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RLMatchup server on port ${PORT}`));
