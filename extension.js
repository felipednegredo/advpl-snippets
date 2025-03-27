const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

// Carrega o arquivo functionsDescriptions.json
const descriptionsPath = path.join(__dirname, 'src', 'functionsDescriptions.json');
const descriptions = JSON.parse(fs.readFileSync(descriptionsPath, 'utf8'));

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('ADVPL Snippets ativado!');

    // Registra o HoverProvider
    const hoverProvider = vscode.languages.registerHoverProvider('advpl', {
        provideHover(document, position) {
            const range = document.getWordRangeAtPosition(position);
            if (!range) return;

            const word = document.getText(range);

            if (descriptions[word]) {
                const { description, documentation } = descriptions[word];
                const markdown = new vscode.MarkdownString();
                markdown.appendText(description);
                if (documentation) {
                    markdown.appendMarkdown(`\n\n[Documentação oficial](${documentation})`);
                }
                return new vscode.Hover(markdown);
            }
        }
    });
    context.subscriptions.push(hoverProvider);

    // Registra o CompletionItemProvider
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        { language: 'advpl', scheme: 'file' },
        {
            provideCompletionItems(document, position) {
                const completionItems = [];

                for (const functionName in descriptions) {
                    const functionInfo = descriptions[functionName];

                    const item = new vscode.CompletionItem(functionName, vscode.CompletionItemKind.Function);
                    item.detail = functionInfo.description;
                    if (functionInfo.documentation) {
                        item.documentation = new vscode.MarkdownString(`[Documentação oficial](${functionInfo.documentation})`);
                    }
                    completionItems.push(item);
                }

                return completionItems;
            }
        },
        '.' // Ativador do IntelliSense
    );
    context.subscriptions.push(completionProvider);
}