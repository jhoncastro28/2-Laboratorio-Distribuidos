const sharp = require('sharp');

async function addWatermark(imageBuffer) {
    return sharp(imageBuffer)
        .composite([{ input: 'marca_agua.png', gravity: 'southeast' }]) // Toca añadir la marca de agua, muchachos
        .toBuffer();
}

module.exports = { addWatermark };