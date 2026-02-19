# RLMatchup 🚀

Plateforme de gestion de tournois Rocket League avec équilibrage automatique des équipes basé sur le MMR.

## ✨ Fonctionnalités

### Gestion de tournois
- **Création de tournois** : Publics ou privés avec code d'accès (6 caractères sans ambigüité)
- **Équilibrage automatique** : Algorithme snake draft basé sur le MMR saisi manuellement
- **Mode aléatoire** : Génération d'équipes complètement aléatoires (sans MMR)
- **Gestion manuelle** : Le créateur peut assigner des joueurs à des équipes spécifiques
- **Privilèges créateur** : Visualisation des MMR, gestion des joueurs, modifications d'équipes

### Inscription et gestion des joueurs
- **Inscription manuelle** : Les joueurs saisissent leur MMR depuis RL Tracker Network
- **Désinscription** : Chaque joueur peut se désinscrire et se réinscrire
- **Édition MMR** : Le créateur peut corriger le MMR des joueurs
- **Suppression** : Le créateur peut supprimer n'importe quel joueur

### Fonctionnalités streaming
- **QR Code** : Génération automatique pour partager le tournoi
- **Copier le lien** : Partage rapide via presse-papier
- **Export texte** : Format Discord/Twitch pour annoncer les équipes
- **Overlay OBS** : Affichage en direct des inscriptions avec QR code intégré

## 🛠️ Installation

### Prérequis
- Node.js (v14 ou supérieur)
- npm

### Étapes

1. **Cloner le dépôt**
```bash
git clone https://github.com/votre-username/rlmatchup.git
cd rlmatchup
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configurer l'environnement (optionnel)**

Créez un fichier `.env` à la racine du projet si vous voulez changer le port :
```env
PORT=3000
```

> **💡 Note** : En local, l'application utilise un stockage en mémoire (Map). Aucune base de données n'est nécessaire pour le développement.

4. **Lancer le serveur**
```bash
node server.js
```

Le serveur démarre sur `http://localhost:3000`

## 🚀 Déploiement sur Vercel

### Prérequis
1. Compte [Vercel](https://vercel.com) (gratuit)
2. Compte [Upstash](https://upstash.com) pour Redis (gratuit) - **Nécessaire uniquement pour la production**

### Étapes de déploiement

#### 1. Créer une base de données Redis sur Upstash

1. Créez un compte sur [Upstash](https://console.upstash.com)
2. Créez une nouvelle base de données Redis :
   - **Name** : `rlmatchup`
   - **Region** : Choisissez la région la plus proche de vos utilisateurs
   - **Type** : Regional (offre gratuite jusqu'à 10 000 commandes/jour)
3. Notez les valeurs suivantes (onglet **REST API**) :
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

#### 2. Déployer sur Vercel

**Option A : Via l'interface Vercel**

1. Connectez-vous à [Vercel](https://vercel.com)
2. Cliquez sur **"New Project"**
3. Importez votre dépôt GitHub/GitLab
4. Dans **Environment Variables**, ajoutez :
   ```
   UPSTASH_REDIS_REST_URL=votre_url_upstash
   UPSTASH_REDIS_REST_TOKEN=votre_token_upstash
   ```
5. Cliquez sur **Deploy**

**Option B : Via CLI**

```bash
# Installer Vercel CLI
npm i -g vercel

# Déployer
vercel

# Configurer les variables d'environnement
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN

# Redéployer avec les variables
vercel --prod
```

#### 3. Tester le déploiement

Votre application sera disponible sur : `https://votre-projet.vercel.app`

> **💡 Notes importantes** :
> - **En local** : Stockage en mémoire (Map) - données perdues au redémarrage
> - **En production** : Redis (Upstash) - persistance entre requêtes serverless
> - Redis n'est **pas nécessaire** pour le développement local

## 📖 Utilisation

### Créer un tournoi

1. Accédez à `http://localhost:3000`
2. Cliquez sur **"Créer un tournoi"**
3. Configurez :
   - Nom du tournoi
   - Nombre de joueurs maximum
   - Taille des équipes (2v2, 3v3, etc.)
   - Type : Public ou Privé
4. Copiez le **code créateur** (permet de gérer le tournoi)

### Rejoindre un tournoi

**En tant que créateur :**
- Utilisez le lien direct fourni lors de la création
- Vous verrez les MMR et pourrez gérer les équipes
- Partagez via QR code, lien ou overlay OBS

**En tant que participant :**
- Parcourez les tournois publics ou entrez un code
- Inscrivez-vous avec votre nom, Epic ID et MMR
- Consultez votre MMR sur [RL Tracker Network](https://rocketleague.tracker.network/)
- Les MMR sont masqués pour les participants (sauf mode créateur)
- Vous pouvez vous désinscrire et vous réinscrire si besoin

### Gestion des équipes (créateur uniquement)

Avant de générer les équipes :
- **Assigner manuellement** : Sélectionnez une équipe dans le menu déroulant
- **Supprimer un joueur** : Cliquez sur ✕ (confirmation requise)

Après avoir assigné manuellement certains joueurs, cliquez sur **"Générer les équipes"** :
- Les joueurs assignés manuellement restent dans leurs équipes
- Les autres sont distribués équitablement via l'algorithme snake draft

## 🏗️ Architecture

```
rlmatchup/
├── server.js          # API Backend (Express + Redis optionnel)
├── public/
│   ├── index.html     # Page d'accueil
│   ├── create.html    # Création de tournoi
│   ├── browse.html    # Navigation des tournois publics
│   ├── tournament.html # Détails du tournoi
│   ├── overlay.html   # Overlay OBS pour streaming
│   └── style.css      # Styles globaux
├── .env               # Configuration locale (optionnel, non versioné)
├── .env.example       # Template de configuration
├── vercel.json        # Configuration Vercel
├── package.json       # Dépendances
└── README.md
```

### Stockage des données

- **Local (développement)** : Map (en mémoire) - données perdues au redémarrage, aucune configuration requise
- **Production (Vercel)** : Upstash Redis - persistance entre requêtes serverless, nécessaire pour fonctionnement multi-utilisateurs

## 🔧 API Endpoints

### Tournois
- `POST /api/tournament/create` - Créer un tournoi
- `GET /api/tournaments/public` - Liste des tournois publics
- `GET /api/tournament/:id` - Détails d'un tournoi
- `POST /api/tournament/:id/register` - S'inscrire
- `POST /api/tournament/:id/generate` - Générer les équipes

### Gestion des joueurs
- `DELETE /api/tournament/:id/player/:epicId` - Supprimer un joueur (créateur ou joueur lui-même)
- `POST /api/tournament/:id/player/:epicId/assign` - Assigner à une équipe (créateur uniquement)
- `POST /api/tournament/:id/player/:epicId/mmr` - Modifier le MMR (créateur uniquement)
- `POST /api/tournament/:id/update-teams` - Mettre à jour les équipes (créateur uniquement)

## 🔐 Sécurité

- ✅ Codes de tournoi sans caractères ambigus (I, O, 0, 1 exclus)
- ✅ Identification créateur via `localStorage` (côté client)
- ✅ Vérification Epic ID case-insensitive (évite les doublons)
- ✅ Stockage Redis chiffré TLS (Upstash en production)
- ✅ Désinscription individuelle possible
- ⚠️ **Note** : Pas d'authentification serveur forte - convient pour tournois communautaires courts

## 🚀 Améliorations futures

- [ ] Authentification utilisateur OAuth (Discord/Epic Games)
- [ ] Système de brackets/élimination directe avec scores
- [ ] Statistiques et historique des tournois
- [ ] Notifications en temps réel (WebSocket/SSE)
- [ ] Export des résultats (PDF/CSV)
- [ ] Support multi-jeux (Valorant, CS2, LoL, etc.)
- [ ] Mode spectateur avec résultats en direct
- [ ] Intégration API Rocket League officielle (si disponible)

## 📝 Licence

MIT

## 👤 Auteur

Créé avec ❤️ pour la communauté Rocket League
