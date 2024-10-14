const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Iniciar el servidor en el puerto 3000 (o el que prefieras)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor del front-end corriendo en http://localhost:${PORT}`);
});