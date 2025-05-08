const vscode = require('vscode');

/**
 * Cria um hover com base na descrição de uma função.
 * @param {string} word - Nome da função.
 * @param {object} info - Informações da função.
 * @returns {vscode.Hover} - Objeto de hover.
 */
function createHoverFromDescription(word, info) {
    const markdown = new vscode.MarkdownString();
    const title = word.replace(/\b\w/g, char => char.toUpperCase());

    markdown.appendMarkdown(`## ${title}\n${info.description || ''}\n\n`);

    if (info.parameters && Object.keys(info.parameters).length > 0) {
        markdown.appendMarkdown('#### Parâmetros:\n');
        for (const [param, meta] of Object.entries(info.parameters)) {
            markdown.appendMarkdown(`- \`${param}\` (${meta.type}): ${meta.description}\n`);
        }
    }

    markdown.appendMarkdown(info.returns
        ? `\n#### Retorno:\n- (${info.returns.type}): ${info.returns.description}\n`
        : '\nSem retorno.\n'
    );

    if (info.example) {
        markdown.appendMarkdown('\n#### Exemplo:\n');
        markdown.appendCodeblock(info.example, 'advpl');
    }

    if (info.documentation) {
        markdown.appendMarkdown(`\n[Documentação completa](${info.documentation})\n`);
    }

    markdown.isTrusted = true;
    return new vscode.Hover(markdown);
}

/**
 * Registra o HoverProvider para a linguagem ADVPL.
 * @param {object} descriptions - Objeto contendo descrições das funções.
 * @returns {vscode.Disposable} - Registro do HoverProvider.
 */
function registerHoverProvider(descriptions) {
    return vscode.languages.registerHoverProvider('advpl', {
        provideHover(document, position) {
            try {
                const range = document.getWordRangeAtPosition(position, /\b\w+\b/);
                const word = document.getText(range)?.toLowerCase();

                if (!word) return null;

                // Verificar se a função é nativa do ADVPL
                if (descriptions[word]) {
                    const info = descriptions[word];
                    return createHoverFromDescription(word, info);
                }

                return null;
            } catch (err) {
                console.error('Erro no HoverProvider:', err);
                return null;
            }
        }
    });
}

module.exports = { registerHoverProvider, createHoverFromDescription };