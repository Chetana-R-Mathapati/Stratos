const express = require('express');
const path = require('path');
const app = express();

// Serve static files from the www directory
app.use(express.static(path.join(__dirname, 'www')));

// Handle all routes by serving index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'www', 'index.html'));
});

const PORT = 5000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`Server running at:`);
    console.log(`- Local: http://localhost:${PORT}`);
    console.log(`- Network: http://192.168.29.35:${PORT}`);
}); 