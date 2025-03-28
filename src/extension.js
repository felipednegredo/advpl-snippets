const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

function activate(context) {
    console.log('Extension activated'); // Debug: Ativação da extensão

    let descriptions = {};
    let classesData = {};

    // Carrega o arquivo functionDescriptions.json
    try {
        const descriptionsPath = path.join(__dirname, 'functionDescriptions.json');
        descriptions = JSON.parse(fs.readFileSync(descriptionsPath, 'utf8'));
        console.log('functionDescriptions.json loaded:', descriptions); // Debug: Conteúdo do arquivo
    } catch (error) {
        console.error('Erro ao carregar functionDescriptions.json:', error.message);
    }

    // Carrega o arquivo classesMethods.json
    try {
        const classesPath = path.join(__dirname, 'classesMethods.json');
        classesData = JSON.parse(fs.readFileSync(classesPath, 'utf8'));
        console.log('classesMethods.json loaded:', classesData); // Debug: Conteúdo do arquivo
    } catch (error) {
        console.error('Erro ao carregar classesMethods.json:', error.message);
    }

    // Provedor de hover para arquivos .prw e .tlpp
    const hoverProvider = vscode.languages.registerHoverProvider(['prw', 'tlpp'], {
        provideHover(document, position) {
            const range = document.getWordRangeAtPosition(position);
            const word = document.getText(range);
            console.log('Hover triggered for word:', word); // Debug: Palavra detectada

            if (descriptions[word]) {
                const { description, documentation, example } = descriptions[word];
                console.log('Hover data found:', descriptions[word]); // Debug: Dados encontrados
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

            console.log('No hover data found for word:', word); // Debug: Nenhum dado encontrado
            return null; // Retorna null se não houver correspondência
        }
    });

    // Provedor de CompletionItem para arquivos .prw e .tlpp
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        ['prw', 'tlpp'], // Suporte para .prw e .tlpp
        {
            provideCompletionItems(document, position) {
                console.log('Completion triggered'); // Debug: IntelliSense ativado
                const completionItems = [];

                // Adiciona classes e métodos como sugestões
                for (const className in classesData) {
                    const classInfo = classesData[className];
                    console.log('Processing class:', className); // Debug: Classe processada

                    // Adiciona a classe como sugestão
                    const classItem = new vscode.CompletionItem(className, vscode.CompletionItemKind.Class);
                    classItem.detail = classInfo.description;
                    completionItems.push(classItem);

                    // Adiciona métodos da classe como sugestões
                    if (classInfo.methods) {
                        for (const methodName in classInfo.methods) {
                            const methodInfo = classesData[className].methods[methodName];
                            console.log(`Processing method: ${className}:${methodName}`); // Debug: Método processado
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

                console.log('Completion items generated:', completionItems); // Debug: Itens gerados
                return completionItems;
            }
        },
        '.', ':' // Ativa o IntelliSense após digitar "." ou ":"
    );

    context.subscriptions.push(hoverProvider);
    context.subscriptions.push(completionProvider);
}

function deactivate() {
    console.log('Extension deactivated'); // Debug: Desativação da extensão
}

module.exports = {
    activate,
    deactivate
};