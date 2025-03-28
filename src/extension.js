const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

function activate(context) {
    let descriptions = {};
    let classesData = {};

    // Carrega o arquivo functionDescriptions.json
    try {
        const descriptionsPath = path.join(__dirname, 'functionDescriptions.json');
        descriptions = JSON.parse(fs.readFileSync(descriptionsPath, 'utf8'));
    } catch (error) {
        console.error('Erro ao carregar functionDescriptions.json:', error.message);
    }

    // Carrega o arquivo classesMethods.json
    try {
        const classesPath = path.join(__dirname, 'classesMethods.json');
        classesData = JSON.parse(fs.readFileSync(classesPath, 'utf8'));
    } catch (error) {
        console.error('Erro ao carregar classesMethods.json:', error.message);
    }

    // Provedor de hover para arquivos .prw e .tlpp
    const hoverProvider = vscode.languages.registerHoverProvider(['prw', 'tlpp'], {
        provideHover(document, position) {
            const range = document.getWordRangeAtPosition(position);
            const word = document.getText(range);

            if (descriptions[word]) {
                const { description, documentation, example } = descriptions[word];
                const markdown = new vscode.MarkdownString();
                markdown.appendText(description);
                if (example) {
                    markdown.appendMarkdown(`\n\n**Exemplo:**\n\`\`\`advpl\n${example}\n\`\`\``);
                }
                if (documentation) {
                    markdown.appendMarkdown(`\n\n[Documentação oficial](${documentation})`);
                }
                markdown.isTrusted = true; // Permite links clicáveis
                return new vscode.Hover(markdown);
            }

            return null; // Retorna null se não houver correspondência
        }
    });

    // Provedor de CompletionItem para arquivos .prw e .tlpp
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        ['prw', 'tlpp'], // Suporte para .prw e .tlpp
        {
            provideCompletionItems(document, position) {
                const completionItems = [];

                // Adiciona classes e métodos como sugestões
                for (const className in classesData) {
                    const classInfo = classesData[className];

                    // Adiciona a classe como sugestão
                    const classItem = new vscode.CompletionItem(className, vscode.CompletionItemKind.Class);
                    classItem.detail = classInfo.description;
                    completionItems.push(classItem);

                    // Adiciona métodos da classe como sugestões
                    if (classInfo.methods) {
                        for (const methodName in classInfo.methods) {
                            const methodInfo = classInfo.methods[methodName];
                            const methodItem = new vscode.CompletionItem(`${className}:${methodName}()`, vscode.CompletionItemKind.Method);
                            methodItem.detail = methodInfo.description;

                            // Adiciona parâmetros ao método, se existirem
                            if (methodInfo.parameters) {
                                methodItem.insertText = new vscode.SnippetString(
                                    `${className}:${methodName}(${methodInfo.parameters.map((param, index) => `\${${index + 1}:${param}}`).join(', ')})`
                                );
                            } else {
                                methodItem.insertText = `${className}:${methodName}()`;
                            }

                            completionItems.push(methodItem);
                        }
                    }
                }

                return completionItems;
            }
        },
        '.', ':' // Ativa o IntelliSense após digitar "." ou ":"
    );

    // Provedor adicional para palavras-chave e snippets
    const snippetProvider = vscode.languages.registerCompletionItemProvider(
        ['prw', 'tlpp'], // Suporte para .prw e .tlpp
        {
            provideCompletionItems() {
                const snippetCompletionIf = new vscode.CompletionItem('if');
                snippetCompletionIf.insertText = new vscode.SnippetString('if (${1:condicao})\n\t${2:// codigo}\nendif');
                snippetCompletionIf.documentation = new vscode.MarkdownString("Insere uma estrutura `if`.");

                const snippetCompletionFunction = new vscode.CompletionItem('function');
                snippetCompletionFunction.insertText = new vscode.SnippetString('function ${1:NomeFuncao}()\n\t${2:// codigo}\nreturn ${3:valor}\nendfunction');
                snippetCompletionFunction.documentation = new vscode.MarkdownString("Insere uma estrutura de função.");

                const snippetCompletionWhile = new vscode.CompletionItem('while');
                snippetCompletionWhile.insertText = new vscode.SnippetString('while (${1:condicao})\n\t${2:// codigo}\nendwhile');
                snippetCompletionWhile.documentation = new vscode.MarkdownString("Insere uma estrutura `while`.");

                return [snippetCompletionIf, snippetCompletionFunction, snippetCompletionWhile];
            }
        }
    );

    context.subscriptions.push(hoverProvider);
    context.subscriptions.push(completionProvider);
    context.subscriptions.push(snippetProvider);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};