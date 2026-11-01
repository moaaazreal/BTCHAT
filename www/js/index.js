document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
    console.log("Cordova initialized successfully.");
    
    document.getElementById('scan-btn').addEventListener('click', scanDevices);
    document.getElementById('send-btn').addEventListener('click', sendMessage);
    document.getElementById('attach-btn').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });

    document.getElementById('file-input').addEventListener('change', handleFileSelect);
    
    listenForData();
}

// 1. Scan Nearby Devices
function scanDevices() {
    const listEl = document.getElementById('device-list');
    listEl.innerHTML = "<li>Scanning paired devices...</li>";

    if(typeof bluetoothSerial === 'undefined') {
        listEl.innerHTML = "<li>Bluetooth plugin not detected (Run on real device).</li>";
        return;
    }

    bluetoothSerial.list(
        function(devices) {
            listEl.innerHTML = "";
            if(devices.length === 0) {
                listEl.innerHTML = "<li>No paired devices found. Pair via Bluetooth settings first.</li>";
                return;
            }
            devices.forEach(function(device) {
                let li = document.createElement('li');
                li.innerText = device.name + " (" + device.address + ")";
                li.onclick = function() { connectDevice(device.address); };
                listEl.appendChild(li);
            });
        },
        function(error) {
            alert("Bluetooth Scan Error: " + JSON.stringify(error));
        }
    );
}

// 2. Connect to Selected Device via RFCOMM
function connectDevice(address) {
    document.getElementById('connection-status').innerText = "Connecting...";
    
    bluetoothSerial.connect(
        address,
        function() {
            document.getElementById('connection-status').innerText = "Connected";
            document.getElementById('connection-status').className = "status connected";
            alert("Successfully connected!");
        },
        function(reason) {
            document.getElementById('connection-status').innerText = "Disconnected";
            document.getElementById('connection-status').className = "status disconnected";
            alert("Connection Failed: " + JSON.stringify(reason));
        }
    );
}

// 3. Send Text Message
function sendMessage() {
    let input = document.getElementById('message-input');
    let text = input.value.trim();
    if(!text) return;

    let payload = JSON.stringify({ type: 'text', data: text });

    bluetoothSerial.write(
        payload + "\n",
        function() {
            appendMessage(text, 'sent');
            input.value = "";
        },
        function(err) {
            alert("Send failed: " + err);
        }
    );
}

// 4. Append Message to UI Chat Window
function appendMessage(text, sender) {
    let chatWindow = document.getElementById('chat-window');
    let msgDiv = document.createElement('div');
    msgDiv.className = "message " + sender;
    msgDiv.innerHTML = `<span class="text">${escapeHtml(text)}</span>`;
    chatWindow.appendChild(msgDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

// 5. Listen for Incoming Data Stream
function listenForData() {
    if(typeof bluetoothSerial === 'undefined') return;

    bluetoothSerial.subscribe(
        "\n",
        function(data) {
            try {
                let packet = JSON.parse(data);
                if(packet.type === 'text') {
                    appendMessage(packet.data, 'received');
                } else if(packet.type === 'file') {
                    saveFileToVault(packet.name, packet.fileData);
                }
            } catch(e) {
                console.log("Raw data received: " + data);
            }
        },
        function(err) {
            console.log("Subscription error: " + err);
        }
    );
}

// 6. Handle File Selection & Base64 Conversion
function handleFileSelect(event) {
    let file = event.target.files[0];
    if(!file) return;

    let reader = new FileReader();
    reader.onload = function(e) {
        let base64Data = e.target.result;
        let packet = JSON.stringify({
            type: 'file',
            name: file.name,
            fileData: base64Data
        });

        document.getElementById('progress-container').classList.remove('hidden');
        document.getElementById('progress-text').innerText = "Sending file: " + file.name;

        bluetoothSerial.write(
            packet + "\n",
            function() {
                document.getElementById('progress-container').classList.add('hidden');
                appendMessage("File sent successfully: " + file.name, 'sent');
            },
            function(err) {
                document.getElementById('progress-container').classList.add('hidden');
                alert("File transfer failed: " + err);
            }
        );
    };
    reader.readAsDataURL(file);
}

// 7. Save Received File inside Private App Sandbox (Vault)
function saveFileToVault(fileName, base64Data) {
    window.resolveLocalFileSystemURL(cordova.file.dataDirectory, function(dirEntry) {
        dirEntry.getDirectory("vault", { create: true }, function(vaultDir) {
            vaultDir.getFile(fileName, { create: true, exclusive: false }, function(fileEntry) {
                fileEntry.createWriter(function(fileWriter) {
                    
                    let dataBlob = b64toBlob(base64Data.split(',')[1], getMimeType(fileName));
                    
                    fileWriter.onwriteend = function() {
                        appendMessage("Secure file received & saved to Vault: " + fileName, 'received');
                    };
                    fileWriter.onerror = function(e) {
                        console.log("Failed file write: " + e.toString());
                    };
                    
                    fileWriter.write(dataBlob);
                });
            });
        });
    }, function(err) {
        console.log("Storage error: " + JSON.stringify(err));
    });
}

function b64toBlob(b64Data, contentType) {
    contentType = contentType || '';
    let byteCharacters = atob(b64Data);
    let byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        let slice = byteCharacters.slice(offset, offset + 512);
        let byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        let byteArraysSlice = new Uint8Array(byteNumbers);
        byteArrays.push(byteArraysSlice);
    }
    return new Blob(byteArrays, { type: contentType });
}

function getMimeType(filename) {
    if(filename.endsWith('.jpg') || filename.endsWith('.png')) return 'image/jpeg';
    if(filename.endsWith('.txt')) return 'text/plain';
    if(filename.endsWith('.pdf')) return 'application/pdf';
    return 'application/octet-stream';
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}