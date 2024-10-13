const express = require('express');
const multer = require('multer');
const { addWatermark } = require('./watermarkService');

const app = express();
const upload = multer({ storage: multer.memoryStorage() }); 

app.post('/process', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No se recibió ninguna imagen');
        }
        console.log('Archivo recibido:', req.file);
        const processedImageBuffer = await addWatermark(req.file.buffer);

        res.type('image/png');
        res.send(processedImageBuffer);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error al procesar la imagen');
    }
});


const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
    console.log(`Servidor de Back-end escuchando en el puerto ${PORT}`);
});
