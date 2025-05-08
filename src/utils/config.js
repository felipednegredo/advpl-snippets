const path = require('path');
const vscode = require('vscode');
const fs = require('fs');
const homedir = require('os').homedir();

function getServerConfigFile() {
    return path.join(getServerConfigPath(), "servers.json");
}

function getServerConfigPath() {
    return isWorkspaceServerConfig()
      ? getVSCodePath()
      : path.join(homedir, "/.totvsls");
}

function isWorkspaceServerConfig() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return false;

    const settingsPath = path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'settings.json');
    return fs.existsSync(settingsPath);
}

function getVSCodePath() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return '';
    
    return path.join(workspaceFolders[0].uri.fsPath, '.vscode');
}

function getLaunchConfigFile() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return '';
    return path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'launch.json');
}

module.exports = {
    getServerConfigFile,
    getServerConfigPath,
    isWorkspaceServerConfig,
    getVSCodePath,
    getLaunchConfigFile
};
