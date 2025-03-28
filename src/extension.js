const vscode = require('vscode');

function activate(context) {
    console.log('A extensão foi ativada.');

    // Exemplo de comando registrado
    const disposable = vscode.commands.registerCommand('advpl-snippets.helloWorld', () => {
        vscode.window.showInformationMessage('Olá, mundo! A extensão está funcionando.');
    });

    // Adiciona o comando ao contexto da extensão
    context.subscriptions.push(disposable);
}

function deactivate() {
    console.log('A extensão foi desativada.');
}

module.exports = {
    activate,
    deactivate
};