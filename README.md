# RLMatchup 🚀

Plateforme de gestion de tournois Rocket League avec équilibrage automatique des équipes basé sur le MMR.

## ✨ Fonctionnalités

- **Création de tournois** : Publics ou privés avec code d'accès
- **Équilibrage automatique** : Algorithme snake draft basé sur le MMR Tracker.gg
- **Gestion manuelle** : Le créateur peut assigner des joueurs à des équipes spécifiques
- **Mode démo** : MMR aléatoire (500-1500) si l'API Tracker.gg n'est pas disponible
- **Privilèges créateur** : Visualisation des MMR, gestion des joueurs, modifications d'équipes
- **Inscription unique** : Un joueur ne peut s'inscrire qu'une seule fois par tournoi

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

3. **Configurer l'environnement**

Créez un fichier `.env` à la racine du projet :
```env
TRACKER_API_KEY=votre_clé_api_tracker_gg
PORT=3000
```

> **⚠️ Important** : Pour obtenir une clé API Tracker.gg :
> 1. Rejoignez leur [serveur Discord](https://discord.gg/tracker)
> 2. Demandez une clé API dans le canal approprié
> 3. Attendez l'approbation (peut prendre quelques jours)
> 
> En attendant, le mode démo avec MMR aléatoire sera utilisé automatiquement.

4. **Lancer le serveur**
```bash
node server.js
```

Le serveur démarre sur `http://localhost:3000`

## 🚀 Déploiement sur Vercel

### Prérequis
1. Compte [Vercel](https://vercel.com) (gratuit)
2. Compte [Upstash](https://upstash.com) pour Redis (gratuit)

### Étapes de déploiement

#### 1. Créer une base de données Redis sur Upstash

1. Créez un compte sur [Upstash](https://console.upstash.com)
2. Créez une nouvelle base de données Redis :
   - **Name** : `rlmatchup-db`
   - **Region** : Choisissez la région la plus proche de vos utilisateurs
   - **Type** : Regional (gratuit)
3. Notez les valeurs suivantes (onglet **REST API**) :
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

#### 2. Déployer sur Vercel

**Option A : Via l'interface Vercel**

1. Connectez-vous à [Vercel](https://vercel.com)
2. Cliquez sur **"New Project"**
3. Importez votre dépôt GitHub `rlmatchup`
4. Dans **Environment Variables**, ajoutez :
   ```
   TRACKER_API_KEY=votre_clé_tracker_gg
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
vercel env add TRACKER_API_KEY
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN

# Redéployer avec les variables
vercel --prod
```

#### 3. Tester le déploiement

Votre application sera disponible sur : `https://rlmatchup-xxx.vercel.app`

> **💡 Note** : En local, l'application fonctionne toujours avec le stockage en mémoire (Map). Redis est uniquement utilisé en production sur Vercel.

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

**En tant que participant :**
- Parcourez les tournois publics ou entrez un code
- Inscrivez-vous avec votre nom et Epic ID
- Les MMR sont masqués pour les participants

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
├── server.js          # API Backend (Express + Redis)
├── public/
│   ├── index.html     # Page d'accueil
│   ├── create.html    # Création de tournoi
│   ├── browse.html    # Navigation des tournois
│   ├── tournament.html # Détails du tournoi
│   └── style.css      # Styles
├── .env               # Configuration locale (non versionné)
├── .env.example       # Template de configuration
├── vercel.json        # Configuration Vercel
├── package.json       # Dépendances
└── README.md
```

### Stockage des données

- **Local** : Map (en mémoire) - données perdues au redémarrage
- **Production (Vercel)** : Upstash Redis - persistance partagée entre instances serverless

## 🔧 API Endpoints

### Tournois
- `POST /api/tournament/create` - Créer un tournoi
- `GET /api/tournaments/public` - Liste des tournois publics
- `GET /api/tournament/:id` - Détails d'un tournoi
- `POST /api/tournament/:id/register` - S'inscrire
- `POST /api/tournament/:id/generate` - Générer les équipes

### Gestion des joueurs (créateur uniquement)
- `DELETE /api/tournament/:id/player/:epicId` - Supprimer un joueur
- `POST /api/tournament/:id/player/:epicId/assign` - Assigner à une équipe

## 🔐 Sécurité

- ✅ Clé API protégée dans `.env` (exclu de Git)
- ✅ Identification créateur via `localStorage` (côté client)
- ✅ Vérification Epic ID case-insensitive (évite les doublons)
- ✅ Stockage Redis chiffré (Upstash TLS)
- ⚠️ **Note** : Pas d'authentification serveur (convient pour tournois publics/privés courts)

## 🚀 Améliorations futures

- [ ] Authentification utilisateur OAuth (Discord/Epic)
- [ ] Système de brackets/élimination directe
- [ ] Statistiques et historique des tournois
- [ ] Notifications en temps réel (WebSocket)
- [ ] Export des résultats (PDF/CSV)
- [ ] Support multi-jeux (Valorant, CS2, etc.)

## 📝 Licence

MIT

## 👤 Auteur

Créé avec ❤️ pour la communauté Rocket League
