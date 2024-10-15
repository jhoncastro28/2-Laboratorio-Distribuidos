// Conectar con el WebSocket del servicio de Discovery
const ws = new WebSocket('ws://localhost:8080');

// Al recibir actualizaciones de WebSocket
ws.onmessage = function(event) {
    const data = JSON.parse(event.data);
    updateServerTable(data);
};

// Actualizar la tabla de servidores con las nuevas instancias o cambios de estado
function updateServerTable(servers) {
    const serverBody = document.getElementById('servers-body');
    serverBody.innerHTML = '';

    servers.forEach(server => {
        const row = `<tr>
            <td>${server.id}</td>
            <td>${server.status}</td>
            <td>${server.lastCheck}</td>
        </tr>`;
        serverBody.insertAdjacentHTML('beforeend', row);
    });
}

// Botón para crear una nueva instancia
document.getElementById('create-instance-btn').addEventListener('click', async function() {
    try {
        const response = await fetch('http://localhost:6000/create-instance', {
            method: 'POST'
        });
        if (!response.ok) {
            throw new Error('Error al crear instancia');
        }
        alert('Instancia creada con éxito');
        refreshServerStatus();
    } catch (error) {
        alert('Error al crear la instancia: ' + error.message);
    }
});

// Cargar el historial del estado de una instancia específica
document.getElementById('instance-filter').addEventListener('change', async function() {
    const instanceId = this.value;
    const response = await fetch(`http://localhost:6000/instances/${instanceId}/history`);
    const historyData = await response.json();

    updateHistoryChart(historyData);
});

// Función para actualizar el gráfico de historial
function updateHistoryChart(historyData) {
    const timestamps = historyData.map(entry => entry.timestamp);
    const statuses = historyData.map(entry => entry.status === 'healthy' ? 1 : 0);

    chart.data.labels = timestamps;
    chart.data.datasets[0].data = statuses;
    chart.update();
}

// Crear el gráfico usando Chart.js
const ctx = document.getElementById('status-chart').getContext('2d');
const chart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],  // Se actualizará con las fechas
        datasets: [{
            label: 'Estado (1: Healthy, 0: Unhealthy)',
            data: [],  // Se actualizará con el estado
            borderColor: 'rgba(75, 192, 192, 1)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            fill: true
        }]
    },
    options: {
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    stepSize: 1,
                    callback: function(value) {
                        return value === 1 ? 'Healthy' : 'Unhealthy';
                    }
                }
            }
        }
    }
});

// Botón para ejecutar la ingeniería de caos
document.getElementById('chaosButton').addEventListener('click', async () => {
    try {
        const response = await fetch('http://middleware-url:4000/trigger-chaos', {
            method: 'POST',
        });
        if (response.ok) {
            alert('Ingeniería de caos ejecutada con éxito.');
        } else {
            alert('Error al ejecutar ingeniería de caos.');
        }
    } catch (error) {
        console.error('Error al activar caos:', error);
        alert('Error al activar caos.');
    }
});