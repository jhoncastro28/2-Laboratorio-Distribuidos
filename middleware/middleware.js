const express = require('express');
const axios = require('axios');
const multer = require('multer'); // Para recibir la imagen desde el cliente
const FormData = require('form-data');
const cors = require('cors');

const app = express();
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

let instances = [];
let currentIndex = 0;

async function fetchInstances() {
    try {
        const response = await axios.get('http://localhost:6000/instances');
        instances = response.data
            .filter(instance => instance.status === 'healthy')
            .map(instance => ({
                id: instance.id,
                url: `http://${instance.hostIp}:${instance.port}` // Utiliza la IP del host
            }));
        console.log('Instancias saludables actualizadas:', instances);
    } catch (error) {
        console.error('Error al obtener instancias del discovery:', error.message);
    }
}


fetchInstances();
setInterval(fetchInstances, 60000);

app.post('/process', upload.single('image'), async (req, res) => {
    if (instances.length === 0) {
        return res.status(500).send('No hay instancias disponibles.');
    }

    const totalInstances = instances.length;
    let attempts = 0;
    let success = false;

    while (attempts < totalInstances && !success) {
        const instance = instances[currentIndex];
        currentIndex = (currentIndex + 1) % totalInstances;
        attempts++;

        try {
            const formData = new FormData();
            formData.append('image', req.file.buffer, { filename: req.file.originalname });

            // Enviar la imagen a la instancia seleccionada
            const response = await axios.post(`${instance.url}/process`, formData, {
                headers: {
                    ...formData.getHeaders()
                },
                responseType: 'arraybuffer',
                timeout: 5000
            });

            const contentType = response.headers['content-type'];
            res.setHeader('Content-Type', contentType);
            return res.status(response.status).send(Buffer.from(response.data));
        } catch (error) {
            console.log(`Error en la instancia ${instance.id}: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
        }
    }

    return res.status(500).send('No se pudo procesar la solicitud. Todas las instancias fallaron.');
});

const port = 4000;
app.listen(port, () => {
    console.log(`Middleware corriendo en el puerto ${port}`);
});
