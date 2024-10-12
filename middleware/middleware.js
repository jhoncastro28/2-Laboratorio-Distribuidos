const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

let instances = []; // Lista de instancias obtenidas desde el Discovery
let roundRobinIndex = 0;

// Función que implementa lo de Round-Robin
function getNextInstance() {
    if (instances.length === 0) {
        return null;
    }

    const instance = instances[roundRobinIndex];
    roundRobinIndex = (roundRobinIndex + 1) % instances.length;
    return instance;
}

app.post('/process', async (req, res) => {
    let instance = getNextInstance();

    if (!instance) {
        return res.status(503).send('No hay instancias disponibles');
    }

    try {
        const response = await fetch(`${instance.url}/process`, {
            method: 'POST',
            body: req.body,
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error('Error en la instancia seleccionada');
        }

        const result = await response.buffer();
        res.type('image/png');
        res.send(result);
    } catch (error) {
        console.error(`Error en la instancia ${instance.url}, intentando con otra...`);

        // Intentar con la siguiente instancia en el Round-Robin
        const newInstance = getNextInstance();

        if (newInstance) {
            try {
                const retryResponse = await fetch(`${newInstance.url}/process`, {
                    method: 'POST',
                    body: req.body,
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!retryResponse.ok) {
                    throw new Error('Error al intentar otra instancia');
                }

                const retryResult = await retryResponse.buffer();
                res.type('image/png');
                res.send(retryResult);
            } catch (retryError) {
                console.error('Error en la segunda instancia:', retryError);
                res.status(500).send('Error al procesar la imagen en ambas instancias');
            }
        } else {
            res.status(500).send('No hay más instancias disponibles para procesar la imagen');
        }
    }
});

// Registrar y desregistrar instancias
app.post('/update-instances', (req, res) => {
    const { action, instance } = req.body;

    if (action === 'register') {
        instances.push(instance);
        console.log(`Instancia registrada: ${instance.id} - ${instance.url}`);
        return res.json({ message: 'Instancia registrada con éxito' });
    } else if (action === 'deregister') {
        instances = instances.filter(inst => inst.id !== instance.id);
        console.log(`Instancia eliminada: ${instance.id}`);
        return res.json({ message: 'Instancia desregistrada con éxito' });
    }

    return res.status(400).json({ error: 'Acción no válida' });
});

setInterval(() => {
    instances.forEach((instance, index) => {
        fetch(`${instance.url}/healthcheck`)
            .then(() => console.log(`Instancia ${instance.url} activa`))
            .catch(() => {
                console.log(`Instancia ${instance.url} no responde. Eliminándola...`);
                instances.splice(index, 1);
            });
    });
}, 60000);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Middleware corriendo en el puerto ${PORT}`);
});
