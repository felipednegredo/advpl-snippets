const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    const outputChannel = vscode.window.createOutputChannel('MyOutputChannel');

    let disposable = vscode.commands.registerCommand('extension.readOutput', () => {
        outputChannel.show();
        outputChannel.appendLine('Reading Output Panel...');
    });

    let logDisposable = vscode.commands.registerCommand('extension.logMessage', () => {
        const message = 'This is a log message';
        outputChannel.appendLine(message);
        vscode.window.showInformationMessage(`Logged message: ${message}`);
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(logDisposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};