const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const homedir = require('os').homedir();
const { getServerConfigFile } = require('../utils/config');

function showServersWebView(context) {
    const panel = vscode.window.createWebviewPanel(
        'servidoresConfigurados',
        'Servidores Configurados',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    const filePath = getServerConfigFile();
    let jsonData = loadConfigurations(filePath);

    const htmlPath = path.join(context.extensionPath, 'src', 'webviews', 'servers.html');
    const htmlTemplate = fs.readFileSync(htmlPath, 'utf8');
    panel.webview.html = htmlTemplate;

    panel.webview.onDidReceiveMessage((message) => {
        handleWebViewMessage(message, jsonData, filePath, panel);
    });
}

function loadConfigurations(filePath) {
    try {
        return fs.existsSync(filePath)
            ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
            : { configurations: [] };
    } catch (err) {
        vscode.window.showErrorMessage('Erro ao ler arquivo de configurações: ' + err.message);
        return { configurations: [] };
    }
}

function handleWebViewMessage(message, jsonData, filePath, panel) {
    switch (message.command) {
        case 'ready':
            updateWebView(panel, jsonData);
            return;
        case 'delete':
            deleteConfiguration(jsonData, message.index);
            break;
        case 'duplicate':
            duplicateConfiguration(jsonData, message.index);
            break;
        case 'copyConfig':
            copyConfiguration(jsonData, message.index);
            break;
        case 'add':
            addConfigurationFromClipboard(jsonData);
            return;
        case 'export':
            exportConfiguration(jsonData, message.index);
            return;
        case 'import':
            importConfigurations(jsonData);
            return;
        case 'edit':
            editConfiguration(jsonData, message.index, message.updatedConfig);
            break;
    }

    saveConfigurations(filePath, jsonData);
    updateWebView(panel, jsonData);
}

function deleteConfiguration(jsonData, index) {
    jsonData.configurations.splice(index, 1);
}

function duplicateConfiguration(jsonData, index) {
    const original = jsonData.configurations[index];
    const duplicate = { ...original };
    const baseName = duplicate.name || 'Duplicated Config';
    let newName = baseName;
    let count = 1;

    while (jsonData.configurations.some(cfg => cfg.name === newName)) {
        newName = `${baseName} (${count++})`;
    }

    duplicate.name = newName;
    jsonData.configurations.push(duplicate);
}

function copyConfiguration(jsonData, index) {
    const copiedConfig = JSON.stringify(jsonData.configurations[index], null, 4);
    vscode.env.clipboard.writeText(copiedConfig).then(() => {
        vscode.window.showInformationMessage('Configuração copiada para a área de transferência.');
    }, (err) => {
        vscode.window.showErrorMessage('Erro ao copiar para a área de transferência: ' + err.message);
    });
}

function addConfigurationFromClipboard(jsonData) {
    vscode.env.clipboard.readText().then(text => {
        try {
            const newConfig = JSON.parse(text);
            if (typeof newConfig === 'object') {
                jsonData.configurations.push(newConfig);
                vscode.window.showInformationMessage('Configuração adicionada da área de transferência.');
            } else {
                vscode.window.showErrorMessage('Conteúdo inválido na área de transferência.');
            }
        } catch (err) {
            vscode.window.showErrorMessage('Erro: conteúdo da área de transferência não é JSON válido.');
        }
    });
}

function exportConfiguration(jsonData, index) {
    const configText = JSON.stringify(jsonData.configurations[index], null, 4);
    const fileName = jsonData.configurations[index].name || 'servers-new.json';
    const filePath = path.join(homedir, fileName);
    fs.writeFileSync(filePath, configText);
    vscode.window.showInformationMessage(`Configuração exportada para ${filePath}`);
}

function importConfigurations(jsonData) {
    vscode.window.showOpenDialog({ filters: { 'JSON Files': ['json'] } }).then(files => {
        if (files && files.length > 0) {
            try {
                const imported = JSON.parse(fs.readFileSync(files[0].fsPath, 'utf8'));
                jsonData.configurations = jsonData.configurations.concat(imported.configurations || []);
                vscode.window.showInformationMessage('Configurações importadas com sucesso.');
            } catch (err) {
                vscode.window.showErrorMessage('Erro ao importar arquivo: ' + err.message);
            }
        }
    });
}

function editConfiguration(jsonData, index, updatedConfig) {
    const serverConfig = jsonData.configurations[index];
    Object.assign(serverConfig, updatedConfig);
}

function saveConfigurations(filePath, jsonData) {
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 4));
}

function updateWebView(panel, jsonData) {
    panel.webview.postMessage({ configurations: jsonData.configurations });
}

module.exports = { showServersWebView };