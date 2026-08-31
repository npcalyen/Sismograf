/**
 * TÜRKİYE'NİN İLK HALKA AÇIK SİSMİK AKTİVİTE MONİTÖRÜ
 * 
 * @license
 * Copyright (c) 2026 A L Y E N
 * 
 * Bu yazılım özel lisans ile korunmaktadır.
 * TİCARİ kullanım KESİNLİKLE YASAKTIR.
 * 
 * Eğitim ve kişisel kullanım için açık kaynak kod.
 *
 * @author A L Y E N
 * @version 1.0.2
 */
        const KOERI_STATION_URL = 'https://eida.koeri.boun.edu.tr/fdsnws/station/1/query?network=KO&level=channel&format=xml';

        const DATA_SOURCES = {
            koeri: {
                station: 'https://eida.koeri.boun.edu.tr/fdsnws/station/1/query',
                dataselect: 'https://eida.koeri.boun.edu.tr/fdsnws/dataselect/1/query'
            },
            gfz: {
				// GFZ - Almanya
                station: 'https://geofon.gfz-potsdam.de/fdsnws/station/1/query',
                dataselect: 'https://geofon.gfz-potsdam.de/fdsnws/dataselect/1/query'
            },
            eth: {
                // EIDA - ETH Zürih (İsviçre)
                station: 'https://eida.ethz.ch/fdsnws/station/1/query',
                dataselect: 'https://eida.ethz.ch/fdsnws/dataselect/1/query'
            },
            ingv: {
                // EIDA - INGV (İtalya)
                station: 'https://webservices.ingv.it/fdsnws/station/1/query',
                dataselect: 'https://webservices.ingv.it/fdsnws/dataselect/1/query'
            },
            norsar: {
                // EIDA - NORSAR (Norveç)
                station: 'https://eida.geo.uib.no/fdsnws/station/1/query',
                dataselect: 'https://eida.geo.uib.no/fdsnws/dataselect/1/query'
            },
            resif: {
                // EIDA - RESIF (Fransa)
                station: 'https://ws.resif.fr/fdsnws/station/1/query',
                dataselect: 'https://ws.resif.fr/fdsnws/dataselect/1/query'
            },
            bgr: {
                // EIDA - BGR (Almanya)
                station: 'https://eida.bgr.de/fdsnws/station/1/query',
                dataselect: 'https://eida.bgr.de/fdsnws/dataselect/1/query'
            },
            scedc: {
                // SCEDC (Güney Kaliforniya)
                station: 'https://service.scedc.caltech.edu/fdsnws/station/1/query',
                dataselect: 'https://service.scedc.caltech.edu/fdsnws/dataselect/1/query'
            },
            bgs: {
                // BGS (İngiltere)
                station: 'https://eida.bgs.ac.uk/fdsnws/station/1/query',
                dataselect: 'https://eida.bgs.ac.uk/fdsnws/dataselect/1/query'
            }
        };

        let map, stations = [], currentStation = null, currentChannel = null;
        let refreshInterval = null;
        let availableChannels = [];
        let helicorderData = null;
        let currentHelicorderDate = null;
        let currentHelicorderSampleRate = null;
        let hasDataAvailable = false;
        let stationLayer = null;
        let selectedMarker = null;

        function initMap() {
            stationLayer = L.layerGroup().addTo(map);
        }

        function createMap() {
            map = L.map('map', {
                center: [39.0, 35.0],
                zoom: 6,
                zoomControl: true
            });

			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '&copy; OpenStreetMap contributors'
			}).addTo(map);
            initMap();
        }

        async function loadStations() {
            try {
                updateStatus('Fetching station data...');
                const response = await fetch(KOERI_STATION_URL);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const xmlText = await response.text();
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
                
                const parserError = xmlDoc.querySelector('parsererror');
                if (parserError) {
                    throw new Error('XML parsing error: ' + parserError.textContent);
                }
                
                const stationElements = xmlDoc.getElementsByTagName('Station');
                stations = [];
                
                if (stationElements.length === 0) {
                    throw new Error('No stations found in response');
                }
                
                for (let stationEl of stationElements) {
                    try {
                        const code = stationEl.getAttribute('code');
                        const latEl = stationEl.getElementsByTagName('Latitude')[0];
                        const lonEl = stationEl.getElementsByTagName('Longitude')[0];
                        const elevEl = stationEl.getElementsByTagName('Elevation')[0];
                        const siteEl = stationEl.getElementsByTagName('Site')[0];
                        const nameEl = siteEl ? siteEl.getElementsByTagName('Name')[0] : null;
                        const name = nameEl ? nameEl.textContent : code;
                        
                        if (!latEl || !lonEl) {
                            console.warn(`Station ${code} missing coordinates, skipping`);
                            continue;
                        }
                        
                        const lat = parseFloat(latEl.textContent);
                        const lon = parseFloat(lonEl.textContent);
                        const elev = parseFloat(elevEl?.textContent || '0');
                        
                        const channels = [];
                        const channelElements = stationEl.getElementsByTagName('Channel');
                        
                        for (let chanEl of channelElements) {
                            const chanCode = chanEl.getAttribute('code');
                            const locCode = chanEl.getAttribute('locationCode') || '';
                            
                            if (chanCode) {
                                channels.push({
                                    code: chanCode,
                                    locationCode: locCode,
                                    fullCode: `${locCode ? locCode + '.' : ''}${chanCode}`
                                });
                            }
                        }
                        
                        if (!isNaN(lat) && !isNaN(lon) && channels.length > 0) {
                            stations.push({ code, name, lat, lon, elev, channels, network: 'KO', dataSource: 'koeri' });
                        } else if (channels.length === 0) {
                            console.warn(`Station ${code} has no channels, skipping`);
                        }
                    } catch (err) {
                        console.error('Error parsing station:', err);
                        continue;
                    }
                }
                
                if (stations.length === 0) {
                    throw new Error('No valid stations found');
                }
                
                updateStatus(`Loaded ${stations.length} stations successfully`);
                plotStations();
                
                setTimeout(() => {
                    document.getElementById('statusBar').style.display = 'none';
                }, 3000);
                
            } catch (error) {
                console.error('Error loading stations:', error);
                updateStatus('Error loading stations: ' + error.message);
                showError('Failed to load station data. Please check your connection and try again.');
            }
        }

        function highlightStationMarker(marker) {
            if (selectedMarker && selectedMarker !== marker) {
                selectedMarker.setStyle({
                    radius: 6,
                    color: '#fff',
                    weight: 2,
                    fillOpacity: 0.8
                });
            }
            marker.setStyle({
                radius: 8,
                color: '#fbbf24',
                weight: 3,
                fillOpacity: 1
            });
            marker.bringToFront();
            selectedMarker = marker;
        }

        function plotStations() {
            stationLayer.clearLayers();
            selectedMarker = null;
            stations.forEach(station => {
                const marker = L.circleMarker([station.lat, station.lon], {
                    radius: 6,
                    fillColor: '#3b82f6',
                    color: '#fff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(stationLayer);

                marker.bindTooltip(`${station.code} (${station.network})`, { direction: 'top' });
                marker.on('click', () => {
                    highlightStationMarker(marker);
                    openStation(station);
                });
            });
        }

        function randomMarkerColor() {
            const hues = [210, 0, 120, 40, 280, 30, 180, 340, 90, 270, 150, 55];
            const hue = hues[Math.floor(Math.random() * hues.length)];
            const sat = 85 + Math.floor(Math.random() * 10);
            const light = 55 + Math.floor(Math.random() * 15);
            return `hsl(${hue}, ${sat}%, ${light}%)`;
        }

        async function loadNetworks(providerKey, autoLoad) {
            const select = document.getElementById('networkSelect');
            const src = DATA_SOURCES[providerKey];

            if (!src) {
                select.innerHTML = '<option value="">No provider selected</option>';
                return;
            }

            if (providerKey === 'koeri') {
                select.innerHTML = '<option value="KO">KO - Kandilli</option>';
                select.value = 'KO';
                select.focus();
                if (autoLoad) {
                    updateStatus(`Provider KOERI: KO network — loading stations…`);
                    loadNetworkStations();
                }
                return;
            }

            select.innerHTML = '<option value="">Loading networks…</option>';
            try {
                const res = await fetch(`${src.station}?level=network&format=text`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const text = await res.text();
                const seen = new Map();
                text.split('\n').forEach(line => {
                    if (!line || line.startsWith('#')) return;
                    const p = line.split('|');
                    const code = (p[0] || '').trim();
                    if (!code || seen.has(code)) return;
                    seen.set(code, { code, name: (p[1] || '').trim() });
                });

                select.innerHTML = '<option value="">— Select network —</option>';
                [...seen.values()]
                    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                    .forEach(n => {
                        const opt = document.createElement('option');
                        opt.value = n.code;
                        opt.textContent = n.code + (n.name ? ` - ${n.name}` : '');
                        select.appendChild(opt);
                    });
                updateStatus(`Provider ${providerKey.toUpperCase()}: ${seen.size} networks loaded`);
            } catch (e) {
                console.error('Network load error:', e);
                select.innerHTML = '<option value="">Failed to load networks</option>';
            }
        }

        async function loadNetworkStations() {
            const select = document.getElementById('networkSelect');
            const network = select.value;
            if (!network) return;
            const status = document.getElementById('statusBar');
            status.style.display = 'flex';

            stationLayer.clearLayers();
            selectedMarker = null;
            updateStatus(`Loading stations for network ${network}...`);

            const providerKey = document.getElementById('providerSelect').value || 'koeri';
            const src = DATA_SOURCES[providerKey];

            try {
                if (!src) throw new Error('No data source for provider ' + providerKey);
                const res = await fetch(`${src.station}?network=${encodeURIComponent(network)}&level=station&format=text`);
                if (res.status === 502 || res.status === 503) {
                    updateStatus(`The ${providerKey.toUpperCase()} data server is temporarily unavailable (HTTP ${res.status}). It may be under maintenance — please try again later.`);
                    return;
                }
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const text = await res.text();
                const arr = [];
                text.split('\n').forEach(line => {
                    if (!line || line.startsWith('#')) return;
                    const p = line.split('|');
                    if (p.length < 6) return;
                    const lat = parseFloat(p[2]);
                    const lon = parseFloat(p[3]);
                    if (isNaN(lat) || isNaN(lon)) return;
                    arr.push({
                        code: p[1].trim(),
                        network,
                        dataSource: providerKey,
                        lat,
                        lon,
                        elev: parseFloat(p[4]) || 0,
                        name: (p[5] || '').trim() || p[1].trim()
                    });
                });

                if (arr.length === 0) {
                    updateStatus(`No station data available for network ${network} (${providerKey.toUpperCase()}).`);
                    return;
                }

                updateStatus(`Displaying ${arr.length} stations for ${network} (${providerKey.toUpperCase()})...`);

                arr.forEach(st => {
                    const color = randomMarkerColor();
                    const marker = L.circleMarker([st.lat, st.lon], {
                        radius: 6,
                        fillColor: color,
                        color: '#fff',
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.8
                    }).addTo(stationLayer);
                    marker.bindTooltip(`${st.code} (${st.network})`, { direction: 'top' });
                    marker.on('click', () => {
                        highlightStationMarker(marker);
                        openStationWithChannels(st);
                    });
                });

                const bounds = L.latLngBounds(arr.map(st => [st.lat, st.lon]));
                map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });

                updateStatus(`Displayed ${arr.length} stations for ${network}.`);
            } catch (e) {
                console.error('Station load error:', e);
                updateStatus(`Failed to load stations for ${network}: ${e.message}`);
            }
        }

        function initNetworks() {
            const providerSelect = document.getElementById('providerSelect');
            const networkSelect = document.getElementById('networkSelect');
            if (!networkSelect) return;
            if (providerSelect) {
                providerSelect.addEventListener('change', () => loadNetworks(providerSelect.value, true));
            }
            networkSelect.addEventListener('change', loadNetworkStations);
            const initial = providerSelect ? providerSelect.value : 'koeri';
            loadNetworks(initial, false);
        }

        async function openStationWithChannels(station) {
            updateStatus(`Loading channels for ${station.code} (${station.network})...`);
            const ds = DATA_SOURCES[station.dataSource] || DATA_SOURCES.gfz;
            try {
                const xmlText = await fetchStationChannelsXML(ds.station, station.network, station.code);
                station.channels = parseStationChannelsXML(xmlText);
                if (station.channels.length === 0) {
                    updateStatus(`No channels found for ${station.code}.`);
                    availableChannels = [];
                    currentStation = station;
                    currentChannel = null;
                    document.getElementById('sidebar').classList.add('open');
                    renderChannelSelector();
                    return;
                }
                openStation(station);
                updateStatus(`Loaded ${station.channels.length} channels for ${station.code} (${station.network}).`);
            } catch (e) {
                console.error('Channel load error:', e);
                updateStatus(`Failed to load channels for ${station.code}: ${e.message}`);
            }
        }

        async function fetchStationChannelsXML(stationBase, network, stationCode) {
            const url = `${stationBase}?network=${encodeURIComponent(network)}&station=${encodeURIComponent(stationCode)}&level=channel&format=xml`;
            const res = await fetch(url);
            if (res.status === 204) return '';
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.text();
        }

        function parseStationChannelsXML(xmlText) {
            const channels = [];
            if (!xmlText) return channels;
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            if (xmlDoc.querySelector('parsererror')) return channels;
            const channelElements = xmlDoc.getElementsByTagName('Channel');
            for (let chanEl of channelElements) {
                const chanCode = chanEl.getAttribute('code');
                const locCode = chanEl.getAttribute('locationCode') || '';
                if (!chanCode) continue;
                channels.push({
                    code: chanCode,
                    locationCode: locCode,
                    fullCode: `${locCode ? locCode + '.' : ''}${chanCode}`
                });
            }
            return channels;
        }

        function openStation(station) {
            currentStation = station;
            availableChannels = station.channels;
            currentChannel = null;
            
            document.getElementById('sidebar').classList.add('open');
            
            document.getElementById('stationName').textContent = `${station.code} - ${station.name}`;
            document.getElementById('stationInfo').textContent = `${station.network} • ${station.lat.toFixed(4)}, ${station.lon.toFixed(4)}`;
            document.getElementById('stationCodeDisplay').textContent = `${station.code} - ${station.name}`;
            document.getElementById('networkCode').textContent = station.network;
            document.getElementById('latitude').textContent = station.lat.toFixed(4) + '°';
            document.getElementById('longitude').textContent = station.lon.toFixed(4) + '°';
            document.getElementById('elevation').textContent = station.elev.toFixed(0) + ' m';
            
            if (refreshInterval) {
                clearInterval(refreshInterval);
                refreshInterval = null;
            }
            
            renderChannelSelector();
        }

        function renderChannelSelector() {
            const selector = document.getElementById('channelSelector');
            
            if (availableChannels.length === 0) {
                selector.innerHTML = '<div class="no-channels">No channels available for this station</div>';
                showWarning('This station has no available channels');
                return;
            }
            
            const channelTypes = new Set(availableChannels.map(c => c.code));
            
            selector.innerHTML = '';
            let firstChannel = true;
            
            channelTypes.forEach(type => {
                const btn = document.createElement('button');
                btn.className = 'channel-btn';
                btn.textContent = type;
                btn.onclick = () => selectChannel(type);
                
                if (firstChannel) {
                    btn.classList.add('active');
                    currentChannel = type;
                    firstChannel = false;
                }
                
                selector.appendChild(btn);
            });
            
            if (currentChannel) {
                updateChartTitles();
                
                if (refreshInterval) {
                    clearInterval(refreshInterval);
                }
                
                loadSeismicData();
                
                refreshInterval = setInterval(loadSeismicData, 30000);
            }
        }

        function zoomToStation() {
            if (!currentStation) return;
            map.setView([currentStation.lat, currentStation.lon], 10, {
                animate: true,
                duration: 1
            });
        }

        function closeSidebar() {
            document.getElementById('sidebar').classList.remove('open');
            if (refreshInterval) {
                clearInterval(refreshInterval);
                refreshInterval = null;
            }
        }

        function selectChannel(channel) {
            currentChannel = channel;
            document.querySelectorAll('.channel-btn').forEach(btn => {
                btn.classList.toggle('active', btn.textContent === channel);
            });
            
            updateChartTitles();
            
            clearMessages();
            showInfo(`Loading data for channel: ${channel}`);
            
            if (refreshInterval) {
                clearInterval(refreshInterval);
            }
            
            loadSeismicData();
            
            refreshInterval = setInterval(loadSeismicData, 30000);
        }

        function updateChartTitles() {
            if (!currentStation || !currentChannel) return;
            
            const stationInfo = `${currentStation.code} - ${currentStation.name} (${currentChannel})`;
            document.getElementById('waveformTitle').textContent = `Waveform - ${stationInfo}`;
            document.getElementById('spectrogramTitle').textContent = `Spectrogram - ${stationInfo}`;
        }

        async function loadSeismicData() {
            if (!currentStation || !currentChannel) {
                showError('No station or channel selected');
                return;
            }
            
            try {
                clearError();
                
                const endTime = new Date();
                const startTime = new Date(endTime - 15 * 60 * 1000);
                
                const channel = currentStation.channels.find(c => c.code === currentChannel);
                
                if (!channel) {
                    showWarning(`Channel ${currentChannel} not found for station ${currentStation.code}. Available channels: ${currentStation.channels.map(c => c.code).join(', ')}`);
                    return;
                }
                
                const ds = DATA_SOURCES[currentStation.dataSource] || DATA_SOURCES.koeri;
                const url = `${ds.dataselect}?network=${currentStation.network}&station=${currentStation.code}&location=${channel.locationCode || '--'}&channel=${currentChannel}&starttime=${startTime.toISOString()}&endtime=${endTime.toISOString()}`;
                
                //console.log('Fetching data from:', url);
                
                const response = await fetch(url);
                
                if (response.status === 204) {
                    hasDataAvailable = false;
                    hideCharts();
                    showWarning('No data available for the selected time range (last 15 minutes). The station may be offline or not transmitting data.');

                    if (refreshInterval) {
                        clearInterval(refreshInterval);
                        refreshInterval = null;
                    }
                    return;
                }
                
                if (!response.ok) {
                    hasDataAvailable = false;
                    hideCharts();
                    if (response.status === 404) {
                        showError('Data endpoint not found. Please check the station configuration.');
                    } else if (response.status === 400) {
                        console.error('Dataselect 400 for URL:', url);
                        showError(`Invalid request for ${currentStation.code} (${currentStation.network}) channel ${currentChannel}. The station/location combination may not be available on this data provider.`);
                    } else {
                        showError(`Server error: ${response.status} - ${response.statusText}`);
                    }

                    if (refreshInterval) {
                        clearInterval(refreshInterval);
                        refreshInterval = null;
                    }
                    return;
                }
                
                const arrayBuffer = await response.arrayBuffer();
                
                if (arrayBuffer.byteLength === 0) {
                    hasDataAvailable = false;
                    hideCharts();
                    showWarning('Empty response from server. No data available for this time period.');

                    if (refreshInterval) {
                        clearInterval(refreshInterval);
                        refreshInterval = null;
                    }
                    return;
                }
                
                let dataRecords;
                try {
                    dataRecords = seisplotjs.miniseed.parseDataRecords(arrayBuffer);
                } catch (parseError) {
                    hasDataAvailable = false;
                    hideCharts();
                    showError('Failed to parse seismic data: ' + parseError.message);
                    console.error('Parse error:', parseError);
                    return;
                }
                
                if (!dataRecords || dataRecords.length === 0) {
                    hasDataAvailable = false;
                    hideCharts();
                    showWarning('No valid data records found in the response.');
                    return;
                }
                
                const seismograms = seisplotjs.miniseed.seismogramPerChannel(dataRecords);
                
                if (!seismograms || seismograms.length === 0) {
                    hasDataAvailable = false;
                    hideCharts();
                    showError('Could not generate seismogram from data records.');
                    return;
                }
                
                const seismogram = seismograms[0];
                
                let allData = [];
                if (seismogram.segments && seismogram.segments.length > 0) {
                    seismogram.segments.forEach(segment => {
                        if (segment.y && segment.y.length > 0) {
                            allData = allData.concat(Array.from(segment.y));
                        }
                    });
                } else if (seismogram.y && seismogram.y.length > 0) {
                    allData = Array.from(seismogram.y);
                } else {
                    hasDataAvailable = false;
                    hideCharts();
                    showError('Seismogram contains no data points.');
                    return;
                }
                
                if (allData.length === 0) {
                    hasDataAvailable = false;
                    hideCharts();
                    showWarning('No data points found in seismogram.');
                    return;
                }
                
                const processedSeismogram = {
                    y: allData,
                    startTime: startTime,
                    endTime: endTime,
                    sampleRate: seismogram.sampleRate || (seismogram.segments && seismogram.segments[0].sampleRate)
                };
                
                hasDataAvailable = true;
                showCharts();
                
                drawWaveform(processedSeismogram);
                drawSpectrogram(processedSeismogram);
                
                const updateTime = new Date().toLocaleTimeString('tr-TR');
                document.getElementById('lastUpdate').textContent = updateTime;
                clearMessages();
                showInfo(`Data updated at ${updateTime} (${allData.length} samples)`);
                
            } catch (error) {
                console.error('Error loading seismic data:', error);
                hasDataAvailable = false;
                hideCharts();
                
                if (error.name === 'TypeError' && error.message.includes('fetch')) {
                    const src = currentStation ? (currentStation.dataSource || 'data') : 'data';
                    showError(`Network error: Unable to reach the ${src.toUpperCase()} data server. Please check your internet connection.`);
                } else if (error.message.includes('CORS')) {
                    showError('Cross-origin request blocked. The server may not allow browser access.');
                } else {
                    showError('Failed to load seismic data: ' + error.message);
                }
            }
        }

        function showCharts() {
            document.getElementById('waveformContainer').classList.add('visible');
            document.getElementById('spectrogramContainer').classList.add('visible');
        }

        function hideCharts() {
            document.getElementById('waveformContainer').classList.remove('visible');
            document.getElementById('spectrogramContainer').classList.remove('visible');
        }

        function drawWaveform(seismogram) {
            const canvas = document.getElementById('waveformCanvas');
            const ctx = canvas.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            
            canvas.width = canvas.offsetWidth * dpr;
            canvas.height = canvas.offsetHeight * dpr;
            ctx.scale(dpr, dpr);
            
            const width = canvas.offsetWidth;
            const height = canvas.offsetHeight;
            
            ctx.fillStyle = '#0f1729';
            ctx.fillRect(0, 0, width, height);
            
            const data = seismogram.y;
            
            const mean = data.reduce((a, b) => a + b, 0) / data.length;
            const centeredData = data.map(d => d - mean);
            
            const max = centeredData.reduce((m, v) => m > Math.abs(v) ? m : Math.abs(v), 0);
            
            if (max === 0 || !isFinite(max)) {
                ctx.fillStyle = '#94a3b8';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('No signal', width / 2, height / 2);
                return;
            }
            
            const centerY = height / 2;
            const stepX = width / centeredData.length;
            const scale = (height * 0.45) / max;
            
            ctx.beginPath();
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1;
            
            for (let i = 0; i < centeredData.length; i++) {
                const x = i * stepX;
                const y = centerY - (centeredData[i] * scale);
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            
            ctx.stroke();
            
            ctx.fillStyle = '#94a3b8';
            ctx.font = '11px sans-serif';

            const toLabel = (t) => {
                const d = t instanceof Date ? t : new Date(t);
                if (isNaN(d.getTime())) return '';
                const hm = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
                const sec = String(d.getSeconds()).padStart(2, '0');
                return hm + ':' + sec;
            };

            if (seismogram.startTime && seismogram.endTime) {
                const startTimeStr = toLabel(seismogram.startTime);
                const endTimeStr = toLabel(seismogram.endTime);

                ctx.textAlign = 'left';
                ctx.fillText(startTimeStr, 5, height - 5);

                ctx.textAlign = 'right';
                ctx.fillText(endTimeStr, width - 5, height - 5);
            }
        }

        function drawSpectrogram(seismogram) {
            const canvas = document.getElementById('spectrogramCanvas');
            const ctx = canvas.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            
            canvas.width = canvas.offsetWidth * dpr;
            canvas.height = canvas.offsetHeight * dpr;
            ctx.scale(dpr, dpr);
            
            const width = canvas.offsetWidth;
            const height = canvas.offsetHeight;
            
            ctx.fillStyle = '#0f1729';
            ctx.fillRect(0, 0, width, height);
            
            const data = seismogram.y;
            
            const windowSize = Math.min(512, Math.pow(2, Math.floor(Math.log2(data.length / 4))));
            const overlap = Math.floor(windowSize / 2);
            const numWindows = Math.floor((data.length - windowSize) / (windowSize - overlap));
            
            if (numWindows <= 0 || windowSize < 16) {
                ctx.fillStyle = '#94a3b8';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Not enough data for spectrogram', width / 2, height / 2);
                return;
            }
            
            for (let i = 0; i < numWindows; i++) {
                const start = i * (windowSize - overlap);
                const window = data.slice(start, start + windowSize);
                
                const fftSize = Math.pow(2, Math.ceil(Math.log2(window.length)));
                while (window.length < fftSize) {
                    window.push(0);
                }
                
                const spectrum = fftNonRecursive(window);
                const magnitudes = spectrum.map(c => Math.sqrt(c.re * c.re + c.im * c.im));
                
                const x = (i / numWindows) * width;
                const barWidth = Math.max(1, width / numWindows);
                
                for (let j = 0; j < magnitudes.length / 2; j++) {
                    const y = height - (j / (magnitudes.length / 2)) * height;
                    const intensity = Math.min(1, Math.log(magnitudes[j] + 1) / 8);
                    const color = getSpectrogramColor(intensity);
                    
                    ctx.fillStyle = color;
                    ctx.fillRect(x, y, barWidth + 1, Math.ceil(height / (magnitudes.length / 2)) + 1);
                }
            }
        }

        function getSpectrogramColor(intensity) {
            intensity = Math.max(0, Math.min(1, intensity));
            
            let r, g, b;
            
            if (intensity < 0.13) {

                const t = intensity / 0.13;
                r = Math.floor(0 + t * 20);
                g = Math.floor(0 + t * 10);
                b = Math.floor(5 + t * 35);
            } else if (intensity < 0.25) {

                const t = (intensity - 0.13) / 0.12;
                r = Math.floor(20 + t * 60);
                g = Math.floor(10 + t * 5);
                b = Math.floor(40 + t * 80);
            } else if (intensity < 0.38) {

                const t = (intensity - 0.25) / 0.13;
                r = Math.floor(80 + t * 70);
                g = Math.floor(15 + t * 15);
                b = Math.floor(120 + t * 50);
            } else if (intensity < 0.5) {

                const t = (intensity - 0.38) / 0.12;
                r = Math.floor(150 + t * 55);
                g = Math.floor(30 + t * 15);
                b = Math.floor(170 - t * 80);
            } else if (intensity < 0.63) {

                const t = (intensity - 0.5) / 0.13;
                r = Math.floor(205 + t * 40);
                g = Math.floor(45 + t * 35);
                b = Math.floor(90 - t * 50);
            } else if (intensity < 0.75) {

                const t = (intensity - 0.63) / 0.12;
                r = Math.floor(245 + t * 10);
                g = Math.floor(80 + t * 70);
                b = Math.floor(40 - t * 25);
            } else if (intensity < 0.88) {

                const t = (intensity - 0.75) / 0.13;
                r = Math.floor(255);
                g = Math.floor(150 + t * 70);
                b = Math.floor(15 + t * 35);
            } else {

                const t = (intensity - 0.88) / 0.12;
                r = Math.floor(255);
                g = Math.floor(220 + t * 35);
                b = Math.floor(50 + t * 130);
            }
            
            return `rgb(${r}, ${g}, ${b})`;
        }

        function fftNonRecursive(input) {
            const n = input.length;
            if (n === 1) return [{ re: input[0], im: 0 }];
            
            const output = new Array(n);
            for (let i = 0; i < n; i++) {
                let j = 0;
                let k = i;
                let m = n;
                while (m > 1) {
                    m >>= 1;
                    j = (j << 1) | (k & 1);
                    k >>= 1;
                }
                output[j] = { re: input[i], im: 0 };
            }
            
            for (let size = 2; size <= n; size *= 2) {
                const halfSize = size / 2;
                const angleStep = -2 * Math.PI / size;
                
                for (let i = 0; i < n; i += size) {
                    for (let j = 0; j < halfSize; j++) {
                        const angle = angleStep * j;
                        const cos = Math.cos(angle);
                        const sin = Math.sin(angle);
                        
                        const even = output[i + j];
                        const odd = output[i + j + halfSize];
                        
                        const tRe = cos * odd.re - sin * odd.im;
                        const tIm = cos * odd.im + sin * odd.re;
                        
                        output[i + j] = { re: even.re + tRe, im: even.im + tIm };
                        output[i + j + halfSize] = { re: even.re - tRe, im: even.im - tIm };
                    }
                }
            }
            
            return output;
        }

        function showError(message) {
            document.getElementById('errorContainer').innerHTML = `
                <div class="error-message">
                    <span style="font-size: 16px; margin-right: 8px;">⚠️</span>
                    <div>${message}</div>
                </div>
            `;
        }

        function showWarning(message) {
            const container = document.getElementById('messageContainer');
            container.innerHTML = `
                <div class="warning-message">
                    <span class="warning-icon">⚠️</span>
                    <div>${message}</div>
                </div>
            `;
        }

        function showInfo(message) {
            const container = document.getElementById('messageContainer');
            container.innerHTML = `
                <div class="info-message">
                    ${message}
                </div>
            `;
        }

        function clearError() {
            document.getElementById('errorContainer').innerHTML = '';
        }

        function clearMessages() {
            document.getElementById('messageContainer').innerHTML = '';
        }

        function updateStatus(message) {
            document.getElementById('statusBar').textContent = message;
        }

        window.openHelicorder = function() {
            if (!currentStation || !currentChannel) {
                showError('Please select a station and channel first');
                return;
            }

            if (refreshInterval) {
                clearInterval(refreshInterval);
                refreshInterval = null;
            }

            document.getElementById('helicorderModal').classList.add('open');
            
            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];
            document.getElementById('helicorderDate').value = dateStr;
            document.getElementById('helicorderDate').max = dateStr;
            
            document.getElementById('helicorderTitle').textContent = 
                `24-Hour Helicorder - ${currentStation.code} - ${currentStation.name} (${currentChannel})`;
            
            loadHelicorderData(dateStr);
            
            document.getElementById('helicorderDate').onchange = (e) => {
                loadHelicorderData(e.target.value);
            };
        };

        window.closeHelicorder = function() {
            document.getElementById('helicorderModal').classList.remove('open');
            
            if (currentStation && currentChannel && !refreshInterval) {
                refreshInterval = setInterval(loadSeismicData, 30000);
            }
        };

        async function loadHelicorderData(dateStr) {
            const plotDiv = document.getElementById('helicorderPlot');
            plotDiv.innerHTML = '<div class="helicorder-loading"><div class="spinner"></div>Loading 24-hour data...</div>';

            try {
                const selectedDate = new Date(dateStr + 'T00:00:00');
                const now = new Date();
                
                const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const selectDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                
                if (selectDate > todayDate) {
                    plotDiv.innerHTML = '<div class="error-message" style="margin: 40px;">Cannot select future dates. Please choose today or an earlier date.</div>';
                    return;
                }

                const channel = currentStation.channels.find(c => c.code === currentChannel);
                if (!channel) {
                    plotDiv.innerHTML = '<div class="error-message" style="margin: 40px;">Channel not found</div>';
                    return;
                }

                const startTime = new Date(dateStr + 'T00:00:00.000Z');
                const endTime = new Date(dateStr + 'T23:59:59.999Z');

                const ds = DATA_SOURCES[currentStation.dataSource] || DATA_SOURCES.koeri;
                const url = `${ds.dataselect}?network=${currentStation.network}&station=${currentStation.code}&location=${channel.locationCode || '--'}&channel=${currentChannel}&starttime=${startTime.toISOString()}&endtime=${endTime.toISOString()}`;
                
                //console.log('Fetching 24-hour data from:', url);
                
                const response = await fetch(url);
                
                if (response.status === 204 || !response.ok) {
                    plotDiv.innerHTML = '<div class="error-message" style="margin: 40px;">No data available for this date.</div>';
                    return;
                }

                const arrayBuffer = await response.arrayBuffer();
                console.log(`Received ${arrayBuffer.byteLength} bytes`);
                
                if (arrayBuffer.byteLength === 0) {
                    plotDiv.innerHTML = '<div class="error-message" style="margin: 40px;">No data available for this date.</div>';
                    return;
                }

                const dataRecords = seisplotjs.miniseed.parseDataRecords(arrayBuffer);
                console.log(`Parsed ${dataRecords.length} data records`);
                
                const seismograms = seisplotjs.miniseed.seismogramPerChannel(dataRecords);
                
                if (!seismograms || seismograms.length === 0) {
                    plotDiv.innerHTML = '<div class="error-message" style="margin: 40px;">Could not parse data for this date.</div>';
                    return;
                }

                const seismogram = seismograms[0];
                
                let allData = [];
                let startTimeActual = null;
                
                if (seismogram.segments && seismogram.segments.length > 0) {
                    seismogram.segments.forEach(segment => {
                        if (segment.y && segment.y.length > 0) {
                            if (!startTimeActual) startTimeActual = segment.startTime;
                            allData = allData.concat(Array.from(segment.y));
                        }
                    });
                } else if (seismogram.y && seismogram.y.length > 0) {
                    allData = Array.from(seismogram.y);
                    startTimeActual = seismogram.startTime;
                }

                if (allData.length === 0) {
                    plotDiv.innerHTML = '<div class="error-message" style="margin: 40px;">No data points found for this date.</div>';
                    return;
                }

                const sampleRate = seismogram.sampleRate || (seismogram.segments && seismogram.segments[0].sampleRate) || 100;
                
                console.log(`Total samples: ${allData.length}, Sample rate: ${sampleRate} Hz`);

                helicorderData = allData;
                currentHelicorderDate = dateStr;
                currentHelicorderSampleRate = sampleRate;

                plotDiv.innerHTML = '';
                drawHelicorderPlotly(plotDiv, allData, sampleRate, startTimeActual, dateStr);

            } catch (error) {
                console.error('Error loading helicorder:', error);
                plotDiv.innerHTML = `<div class="error-message" style="margin: 40px;">Failed to load helicorder data: ${error.message}</div>`;
            }
        }

		function drawHelicorderPlotly(container, data, sampleRate, startTime, dateStr) {
            const samplesPerHour = sampleRate * 3600;
            const hoursToShow = 24;
            
            const userAgent = navigator.userAgent.toLowerCase();
            const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
            const hasLowMemory = navigator.deviceMemory && navigator.deviceMemory < 4;
            const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            const isSmallScreen = window.screen.width <= 768 || window.screen.height <= 1024;
            
            const isMobile = isMobileDevice || hasLowMemory || (isTouchDevice && isSmallScreen);
            
            let sum = 0;
            for (let i = 0; i < data.length; i++) {
                sum += data[i];
            }
            const mean = sum / data.length;
            
            const traces = [];
            
            for (let hour = 0; hour < hoursToShow; hour++) {
                const startIdx = hour * samplesPerHour;
                const endIdx = Math.min(startIdx + samplesPerHour, data.length);
                
                let hourData = [];
                let timeData = [];
                
                if (startIdx < data.length) {
                    const rawHourData = [];
                    const rawTimeData = [];
                    
                    // Mobil downsampling
                    const stride = isMobile ? Math.max(1, Math.ceil((endIdx - startIdx) / 5000)) : 1;
                    for (let i = startIdx; i < endIdx; i += stride) {
                        const timeOffset = (i - startIdx) / sampleRate;
                        rawTimeData.push(timeOffset / 60);
                        rawHourData.push(data[i] - mean);
                    }

                    timeData = rawTimeData;
                    hourData = rawHourData;
                }
                
                const hourStr = String(hour).padStart(2, '0');
                
                traces.push({
                    x: hourData.length > 0 ? timeData : [0, 60],
                    y: hourData.length > 0 ? hourData : [0, 0],
                    type: 'scattergl',
                    mode: 'lines',
                    line: {
                        color: hourData.length > 0 ? '#3b82f6' : 'rgba(59, 130, 246, 0.1)',
                        width: 0.5
                    },
                    xaxis: 'x',
                    yaxis: `y${hour + 1}`,
                    name: `${hourStr}:00`,
                    hovertemplate: hourData.length > 0 ? `<b>${hourStr}:%{x:.1f}min</b><br>Amplitude: %{y:.3f}<extra></extra>` : `<b>${hourStr}:00 (No data)</b><extra></extra>`,
                    showlegend: false
                });
            }
            
            let titleText, titleFontSize;
            
            if (isMobile) {
                titleText = `${currentStation.code} - ${currentStation.name} (${currentChannel}) - ${dateStr} UTC - [Downsampled]`;
                
                const titleLength = titleText.length;
                if (titleLength > 60) {
                    titleFontSize = 9;
                } else if (titleLength > 50) {
                    titleFontSize = 10;
                } else if (titleLength > 40) {
                    titleFontSize = 11;
                } else {
                    titleFontSize = 12;
                }
            } else {
                titleText = `${currentStation.code} - ${currentStation.name} (${currentChannel}) - ${dateStr} UTC`;
                titleFontSize = 16;
            }
            
            const layout = {
                title: {
                    text: titleText,
                    font: { size: titleFontSize, color: '#60a5fa' }
                },
                paper_bgcolor: '#0a0e1a',
                plot_bgcolor: '#0f1729',
                height: isMobile ? 2000 : 1600,
                margin: { l: 100, r: 40, t: 60, b: 60 },
                xaxis: {
                    title: 'Time (minutes)',
                    color: '#94a3b8',
                    gridcolor: '#1e293b',
                    dtick: 10,
                    range: [0, 60],
                    showticklabels: true,
                    side: 'bottom',
                    anchor: 'y24'
                },
                hovermode: 'closest',
                dragmode: 'zoom'
            };
            
            const rowHeight = 1.0 / hoursToShow;
            const gap = 0.002;
            
            for (let i = 0; i < hoursToShow; i++) {
                const yAxisKey = i === 0 ? 'yaxis' : `yaxis${i + 1}`;
                const rowBottom = (hoursToShow - i - 1) * rowHeight;
                const rowTop = (hoursToShow - i) * rowHeight;
                
                layout[yAxisKey] = {
                    domain: [rowBottom + gap, rowTop - gap],
                    anchor: 'x',
                    showticklabels: true,
                    side: 'left',
                    color: '#94a3b8',
                    gridcolor: '#1e293b',
                    zeroline: true,
                    zerolinecolor: '#334155',
                    autorange: true,
                    title: {
                        text: `${String(i).padStart(2, '0')}:00`,
                        font: { size: 11, color: '#94a3b8' }
                    },
                    tickfont: { size: 9, color: '#64748b' }
                };
            }
            
            const config = {
                responsive: true,
                displayModeBar: true,
                modeBarButtonsToRemove: ['lasso2d', 'select2d'],
                displaylogo: false
            };
            
            Plotly.newPlot(container, traces, layout, config);
        }

        createMap();
        loadStations();
        initNetworks();

        document.getElementById('waveformCanvas').addEventListener('click', openHelicorder);