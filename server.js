const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(cors());

// Database setup
const db = new sqlite3.Database('./guestbook.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    db.run(`CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      comment TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) {
        console.error('Error creating table:', err.message);
      }
    });
  }
});

// Routes

// Get all comments
app.get('/api/comments', (req, res) => {
  db.all('SELECT * FROM comments ORDER BY timestamp DESC', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

// Add a new comment
app.post('/api/comments', (req, res) => {
  const { name, comment } = req.body;
  if (!name || !comment) {
    return res.status(400).json({ error: 'Name and comment are required.' });
  }
  db.run('INSERT INTO comments (name, comment) VALUES (?, ?)', [name, comment], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(201).json({ id: this.lastID, name, comment, timestamp: new Date() });
    }
  });
});

// Delete a comment
app.delete('/api/comments/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM comments WHERE id = ?', [id], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'Comment not found.' });
    } else {
      res.status(200).json({ message: 'Comment deleted successfully.' });
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});