const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    let disposable = vscode.commands.registerCommand('extension.readOutput', () => {
        const outputChannel = vscode.window.createOutputChannel('MyOutputChannel');
        outputChannel.show();
        outputChannel.appendLine('Reading Output Panel...');

        const output = vscode.window.createOutputChannel('Output');
        output.show();
        outputChannel.appendLine('Output content cannot be retrieved directly.');
    });

    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};