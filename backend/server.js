const express = require('express');
const app = express();
app.use(express.json());
const mysql = require('mysql');
const cors = require('cors');
const passport = require('passport');

const FacebookTokenStrategy = require('passport-facebook-token');
app.use(cors({origin:'http://localhost:4200'}));
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',   
    password: '',
    database: 'GestionEtudiants'
});
const GoogleStrategy = require('passport-google-oauth20').Strategy;

passport.use(new GoogleStrategy(
    {
        clientID: '1011541733762-6odmumlhq4nut9vseoghhvm2m9pch0hi.apps.googleusercontent.com',
        clientSecret: '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',
        callbackURL: 'http://localhost:3000/auth/google/callback',
    },
    (accessToken, refreshToken, profile, done) => {
        const user = {
            googleId: profile.id,
            name: profile.displayName,
            email: profile.emails[0].value, // Utilise le premier email
        };
        // Simuler une opération async (ex: recherche ou insertion dans la DB)
        return done(null, user);
    }
));

// Middleware pour serialiser/déserialiser l'utilisateur
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Initialisation Passport
app.use(passport.initialize());
// Démarrer l'authentification Google
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Gérer le callback après l'authentification
app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        const { googleId, name, email } = req.user;

        // Vérifier si l'utilisateur existe déjà dans la base de données
        db.query('SELECT * FROM users WHERE google_id = ?', [googleId], (err, result) => {
            if (err) {
                console.error('Erreur SQL:', err);
                return res.status(500).send('Erreur de base de données');
            }

            if (result.length > 0) {
                res.status(200).json({ message: 'Connexion réussie', user: result[0] });
            } else {
                // Ajouter un nouvel utilisateur si inexistant
                db.query(
                    'INSERT INTO users (google_id, name, email) VALUES (?, ?, ?)',
                    [googleId, name, email],
                    (err, result) => {
                        if (err) {
                            console.error('Erreur SQL:', err);
                            return res.status(500).send('Erreur de base de données');
                        }
                        res.status(201).json({
                            message: 'Utilisateur enregistré avec succès',
                            user: { id: result.insertId, googleId, name, email },
                        });
                    }
                );
            }
        });
    }
);

passport.use(new FacebookTokenStrategy(
    {
        clientID: '812871074242144', 
        clientSecret: 'bee29d68daa8747a563f0866b5109395', 
    },
    (accessToken, refreshToken, profile, done) => {
        const user = {
            facebookId: profile.id,
            name: profile.displayName,
            email: profile.emails ? profile.emails[0].value : null,
        };
        return done(null, user); 
    }
));

app.use(passport.initialize());
app.use(express.urlencoded({ extended: true }));

db.connect((err)=>{
    if(err){
        console.log(err)
    }else{
        console.log('connected to database')
    }
})
app.get('/api/etudiants', (req, res) => {
    const page = parseInt(req.query.page) || 1; 
    const size = parseInt(req.query.size) || 6;  
    const offset = (page - 1) * size;  
    const search = req.query.search || ''; 
    const searchQuery = search ? `WHERE nom LIKE '%${search}%' OR prenom LIKE '%${search}%'` : '';
    
    db.query(`SELECT COUNT(*) AS total FROM ETUDIANTS ${searchQuery}`, (err, totalRows) => {
        if (err) {
            console.log(err);
            return res.status(500).send('Database query error');
        }

        const total = totalRows[0].total;  

        db.query(
            `SELECT * FROM ETUDIANTS ${searchQuery} LIMIT ? OFFSET ?`,
            [size, offset], 
            (err, rows) => {
                if (err) {
                    console.log(err);
                    return res.status(500).send('Database query error');
                }

                rows.map((row) => {
                    row.date_naissance = row.date_naissance.toISOString().split('T')[0]; // Format date (YYYY-MM-DD)
                });

                const totalPages = Math.ceil(total / size);

                res.json({
                    etudiants: rows,
                    total: total,
                    totalPages: totalPages, 
                    currentPage: page       
                });
            }
        );
    });
});
app.post('/api/auth/facebook', passport.authenticate('facebook-token'), (req, res) => {
    if (req.user) {
        const { facebookId, name, email } = req.user;

        db.query('SELECT * FROM users WHERE facebook_id = ?', [facebookId], (err, result) => {
            if (err) {
                console.error('Erreur SQL:', err);
                return res.status(500).send('Erreur de base de données');
            }

            if (result.length > 0) {
                res.status(200).json({ message: 'Connexion réussie', user: result[0] });
            } else {
                db.query(
                    'INSERT INTO users (facebook_id, name, email) VALUES (?, ?, ?)',
                    [facebookId, name, email],
                    (err, result) => {
                        if (err) {
                            console.error('Erreur SQL:', err);
                            return res.status(500).send('Erreur de base de données');
                        }
                        res.status(201).json({
                            message: 'Utilisateur enregistré avec succès',
                            user: { id: result.insertId, facebookId, name, email },
                        });
                    }
                );
            }
        });
    } else {
        res.status(401).json({ message: 'Authentification Facebook échouée' });
    }
});

app.get('/api/etudiants/:id',(req,res)=>{
    const id = parseInt(req.params.id)
    db.query(`SELECT * FROM ETUDIANTS WHERE etudiant_id  = ${id}`,(err,rows)=>{
        if(err){
            console.log(err)
            res.status(500).send('database query error')
        }else{
            rows[0].date_naissance = rows[0].date_naissance.toISOString().split('T')[0]
            res.json({etudiants :rows})
        }
    })
})
app.put('/api/etudiants/:id',(req,res)=>{
    const id = parseInt(req.params.id)
    const {nom,prenom,date_naissance,genre,adresse,email,telephone} = req.body
    db.query(`update etudiants set nom='${nom}',prenom='${prenom}',date_naissance='${date_naissance}',genre='${genre}',adresse='${adresse}',email='${email}',telephone='${telephone}' where etudiant_id = ${id}`,(err,rows)=>{
        if(err){
            console.log(err)
            res.status(500).send('database query error')
        }else{
            res.json({etudiants :rows})
        }
    })
})
app.delete('/api/etudiants/:id', (req, res) => {
    const id = parseInt(req.params.id, 10); 
    const query = 'DELETE FROM ETUDIANTS WHERE ETUDIANT_ID = ?';    
    db.query(query, [id], (err, result) => {
        if (err) {
            console.error('Erreur SQL:', err);
            return res.status(500).send('Erreur de base de données');
        }
        res.status(200).json({ message: 'Étudiant supprimé avec succès' });
    });
});
app.post('/api/etudiants',(req,res)=>{
    const {nom,prenom,date_naissance,genre,adresse,email,telephone} = req.body
    const query = 'INSERT INTO ETUDIANTS (nom,prenom,date_naissance,genre,adresse,email,telephone) VALUES (?, ?, ?, ?, ?, ?, ?)';
    db.query(query, [nom,prenom,date_naissance,genre,adresse,email,telephone], (err, result) => {
        if (err) {
            console.error('Erreur SQL:', err);
            return res.status(500).send('Erreur de base de données');
        }
        res.status(201).json({ message: 'Étudiant ajouté avec sucees' });
    });
})
app.listen(3000,()=>{
    console.log('le serveur est demarer')
})