const express = require('express');
const { exec } = require('child_process');
const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

app.post('/create-instance', (req, res) => {
    // Define el comando para crear una nueva instancia en Docker
    const command = 'docker run -d my-app-instance';  // Esto toca cambiarlo por lo que querramos levantar

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error al crear la instancia: ${error.message}`);
            return res.status(500).send('Error al crear la instancia');
        }
        console.log(`Instancia creada con éxito: ${stdout}`);
        res.status(200).send(`Instancia creada con ID: ${stdout}`);
    });
});

app.listen(PORT, () => {
    console.log(`Servidor para creación de instancias corriendo en el puerto ${PORT}`);
});