// Conectar con el WebSocket del servicio de Discovery
const ws = new WebSocket('ws://localhost:8080');

let selectedInstanceId = null;

// Al recibir actualizaciones de WebSocket
ws.onmessage = function(event) {
    const data = JSON.parse(event.data);
    updateServerTable(data);
    populateInstanceFilter(data);
    
    // Si hay una instancia seleccionada, actualizar su información
    if (selectedInstanceId) {
        const selectedInstance = data.find(server => server.id === selectedInstanceId);
        if (selectedInstance) {
            updateInstanceHistory(selectedInstanceId);
            fetchAndDisplayRequests(selectedInstanceId);
        }
    }
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

// Poblar el filtro de instancias
function populateInstanceFilter(servers) {
    const instanceFilter = document.getElementById('instance-filter');
    const currentValue = instanceFilter.value;
    instanceFilter.innerHTML = '<option value="">Seleccione una instancia</option>';
    
    servers.forEach(server => {
        const option = `<option value="${server.id}">${server.id}</option>`;
        instanceFilter.insertAdjacentHTML('beforeend', option);
    });

    // Mantener la selección actual si aún existe
    if (currentValue && servers.some(server => server.id === currentValue)) {
        instanceFilter.value = currentValue;
    }
}

// Botón para crear una nueva instancia
document.getElementById('create-instance-btn').addEventListener('click', async function() {
    try {
        const response = await fetch('http://localhost:6001/create-instance', {
            method: 'POST'
        });
        if (!response.ok) {
            throw new Error('Error al crear instancia');
        }
        alert('Instancia creada con éxito');
    } catch (error) {
        alert('Error al crear la instancia: ' + error.message);
    }
});

// Cargar el historial del estado de una instancia específica
document.getElementById('instance-filter').addEventListener('change', async function() {
    selectedInstanceId = this.value;
    if (selectedInstanceId) {
        await updateInstanceHistory(selectedInstanceId);
        await fetchAndDisplayRequests(selectedInstanceId);
    } else {
        clearRequestsTable();
        clearHistoryChart();
    }
});

// Función para actualizar el historial de estado de la instancia
async function updateInstanceHistory(instanceId) {
    try {
        const response = await fetch(`http://localhost:6001/instances/${instanceId}/history`);
        if (!response.ok) {
            throw new Error('Error al obtener el historial de la instancia');
        }
        const historyData = await response.json();
        updateHistoryChart(historyData);
    } catch (error) {
        console.error('Error:', error);
        clearHistoryChart();
        alert('Error al obtener el historial de la instancia: ' + error.message);
    }
}

// Función para obtener y mostrar las peticiones de la instancia seleccionada
async function fetchAndDisplayRequests(instanceId) {
    try {
        const response = await fetch(`http://localhost:6001/instances/${instanceId}/requests`);
        if (!response.ok) {
            throw new Error('Error al obtener las peticiones');
        }
        const requests = await response.json();
        console.log('Peticiones recibidas:', requests);
        if (Array.isArray(requests)) {
            updateRequestsTable(requests);
        } else {
            throw new Error('La respuesta no es un array');
        }
    } catch (error) {
        console.error('Error:', error);
        clearRequestsTable();
        alert('Error al obtener las peticiones: ' + error.message);
    }
}

// Función para actualizar la tabla de peticiones
function updateRequestsTable(requests) {
    const requestsBody = document.getElementById('requests-body');
    requestsBody.innerHTML = '';

    if (requests.length === 0) {
        requestsBody.innerHTML = '<tr><td colspan="5">No hay peticiones registradas para esta instancia.</td></tr>';
        return;
    }

    requests.forEach(request => {
        const row = `<tr>
            <td>${request.type || 'N/A'}</td>
            <td>${request.payload || 'N/A'}</td>
            <td>${new Date(request.date).toLocaleString()}</td>
            <td>${request.response || 'N/A'}</td>
            <td>${request.url || 'N/A'}</td>
        </tr>`;
        requestsBody.insertAdjacentHTML('beforeend', row);
    });
}


// Función para limpiar la tabla de peticiones
function clearRequestsTable() {
    const requestsBody = document.getElementById('requests-body');
    requestsBody.innerHTML = '<tr><td colspan="5">Seleccione una instancia para ver las peticiones.</td></tr>';
}

// Función para actualizar el gráfico de historial
function updateHistoryChart(historyData) {
    const ctx = document.getElementById('status-chart').getContext('2d');
    
    // Destruir el gráfico existente si lo hay
    if (window.statusChart) {
        window.statusChart.destroy();
    }

    // Preparar los datos para el gráfico
    const labels = historyData.map(entry => new Date(entry.timestamp).toLocaleString());
    const statusData = historyData.map(entry => entry.status === 'healthy' ? 1 : 0);
    const responseTimeData = historyData.map(entry => entry.responseTime);

    // Crear el gráfico usando Chart.js
    window.statusChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Estado',
                    data: statusData,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    yAxisID: 'y-axis-1',
                    stepped: true
                },
                {
                    label: 'Tiempo de Respuesta (ms)',
                    data: responseTimeData,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    yAxisID: 'y-axis-2',
                    type: 'line'
                }
            ]
        },
        options: {
            responsive: true,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            stacked: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Tiempo'
                    }
                },
                'y-axis-1': {
                    type: 'category',
                    labels: ['Unhealthy', 'Healthy'],
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Estado'
                    }
                },
                'y-axis-2': {
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Tiempo de Respuesta (ms)'
                    },
                    grid: {
                        drawOnChartArea: false,
                    },
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label === 'Estado') {
                                return `Estado: ${context.parsed.y === 1 ? 'Healthy' : 'Unhealthy'}`;
                            } else {
                                return `Tiempo de Respuesta: ${context.parsed.y} ms`;
                            }
                        }
                    }
                },
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Historial de Estado y Tiempo de Respuesta'
                }
            }
        }
    });
}

// Función para limpiar el gráfico de historial
function clearHistoryChart() {
    if (window.statusChart) {
        window.statusChart.destroy();
    }
    const ctx = document.getElementById('status-chart').getContext('2d');
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

// Botón para ejecutar la ingeniería de caos
document.getElementById('chaosButton').addEventListener('click', async () => {
    try {
        const response = await fetch('http://localhost:4000/trigger-chaos', {
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

