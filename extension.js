const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Congratulations, your extension "advpl-snippets" is now active!');

    // Comando "Hello World"
    const helloWorldDisposable = vscode.commands.registerCommand('advpl-snippets.helloWorld', function () {
        vscode.window.showInformationMessage('Hello World from advpl-snippets!');
    });
    context.subscriptions.push(helloWorldDisposable);

    // Comando de compilação
    const compileDisposable = vscode.commands.registerCommand('extension.compileFile', async () => {
        const activeEditor = vscode.window.activeTextEditor;

        if (!activeEditor) {
            vscode.window.showErrorMessage('Nenhum arquivo aberto para compilar.');
            return;
        }

        const filePath = activeEditor.document.fileName;
        try {
            // Executa o comando original "totvs-developer-studio.build.file"
            const compilationResult = await vscode.commands.executeCommand('totvs-developer-studio.build.file');

            if (compilationResult) {
                vscode.window.showInformationMessage('O arquivo foi compilado com sucesso!');
            } else {
                const errorMessage = (compilationResult || 'Erro desconhecido.');
                vscode.window.showErrorMessage(`Erro ao compilar o arquivo: ${errorMessage}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Erro inesperado durante a compilação: ${error.message || error}`);
        }
    });
    context.subscriptions.push(compileDisposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};