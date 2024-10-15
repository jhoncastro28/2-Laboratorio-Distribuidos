const Docker = require('dockerode');
const docker = new Docker(); // Esto mientras Docker esté corriendo localmente

// La URL del Docker remoto, o local si no se especifica. Cuando ya tengamos el sistema Distribuído
//const dockerHost = process.env.DOCKER_HOST || 'http://localhost:2375';
//const docker = new Docker({ host: dockerHost, port: 2375 });

const getRandomInstance = async () => {
    try {
        const response = await axios.get('http://localhost:6000/instances'); // Cambia la URL si Discovery está en otra máquina
        const healthyInstances = response.data.filter(instance => instance.status === 'healthy');
        
        if (healthyInstances.length === 0) {
            console.log('No hay instancias saludables disponibles para destruir.');
            return null;
        }

        // Seleccionar aleatoriamente una instancia
        const randomIndex = Math.floor(Math.random() * healthyInstances.length);
        return healthyInstances[randomIndex];
    } catch (error) {
        console.error('Error al obtener instancias del discovery:', error.message);
        return null;
    }
};

// Función para obtener una lista de contenedores y eliminar uno aleatoriamente
async function triggerChaosEngineering() {
    try {
        // Obtener una instancia saludable de Discovery
        const instance = await getRandomInstance();
        
        if (!instance) {
            console.log("No hay instancias saludables disponibles para ejecutar caos.");
            return;
        }

        console.log(`Instancia seleccionada para el caos: ${instance.id} en ${instance.hostIp}`);

        // Conectar al Docker de la instancia seleccionada (en su host correspondiente)
        const docker = new Docker({
            host: instance.hostIp,  // Usar la IP del host de la instancia
            port: 2375               // Asume que Docker está expuesto en el puerto 2375 en el host remoto
        });

        // Obtener la lista de contenedores en ejecución en ese Docker Host
        const containers = await docker.listContainers();
        
        if (containers.length === 0) {
            console.log("No hay contenedores en ejecución en el host seleccionado.");
            return;
        }

        // Selecciona un contenedor aleatorio
        const randomIndex = Math.floor(Math.random() * containers.length);
        const containerId = containers[randomIndex].Id;
        const container = docker.getContainer(containerId);

        // Detener y eliminar el contenedor seleccionado
        await container.stop();
        await container.remove();
        console.log(`Contenedor con ID ${containerId} en el host ${instance.hostIp} ha sido destruido.`);
    } catch (error) {
        console.error("Error al ejecutar ingeniería de caos:", error);
    }
}

module.exports = { triggerChaosEngineering };
