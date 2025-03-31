
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

function activate(context) {
    let descriptions = {};
    let classesData = {};

    // Tenta carregar o arquivo functionDescriptions.json
    try {
        const descriptionsPath = path.join(__dirname, 'functionDescriptions.json');
        descriptions = JSON.parse(fs.readFileSync(descriptionsPath, 'utf8'));
    } catch (error) {
        console.error('Erro ao carregar functionDescriptions.json:', error.message);
    }

    // Tenta carregar o arquivo classesMethods.json
    try {
        const classesPath = path.join(__dirname, 'classesMethods.json');
        classesData = JSON.parse(fs.readFileSync(classesPath, 'utf8'));
    } catch (error) {
        console.error('Erro ao carregar classesMethods.json:', error.message);
    }

    // Registra o provedor de hover para a linguagem ADVPL
    const hoverProvider = vscode.languages.registerHoverProvider('advpl', {
        provideHover(document, position, token) {
            const range = document.getWordRangeAtPosition(position);
            const word = document.getText(range);

            if (descriptions[word]) {
                const { description, documentation } = descriptions[word];
                const markdown = new vscode.MarkdownString();
                markdown.appendText(description);
                if (documentation) {
                    markdown.appendMarkdown(`\n\n[Documentação oficial](${documentation})`);
                }
                markdown.isTrusted = true; // Permite links clicáveis
                return new vscode.Hover(markdown);
            }

            return null; // Retorna null se não houver correspondência
        }
    });

    // ...código existente...

    // Registra o CompletionItemProvider para classes, métodos e variáveis
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        { language: 'advpl', scheme: 'file' },
        {
            provideCompletionItems(document, position) {
                const completionItems = [];

                // Captura o texto do documento atual
                const text = document.getText();

                const variables = new Set();
                
                const variableRegex = /\b(?:LOCAL|STATIC|PUBLIC|PRIVATE)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*:=\s*(.+))?/gi;

                let match;
                while ((match = variableRegex.exec(text)) !== null) {
                    const variableName = match[1]; // Captura o nome da variável
                    const initialValue = match[2] ? match[2].trim() : null; // Captura o valor inicial, se existir
                    const declarationType = match[0].split(/\s+/)[0].toUpperCase(); // Captura o tipo de declaração (LOCAL, STATIC, etc.)
                    variables.add({ variableName, initialValue, declarationType });
                }

                // Log para verificar as variáveis capturadas (para debugging)
                console.log("Variáveis capturadas:", Array.from(variables));

                // Adiciona variáveis ao IntelliSense
                variables.forEach(({ variableName, initialValue, declarationType }) => {
                    const firstChar = variableName.charAt(0).toUpperCase();
                    let variableType = 'Variável';

                    // Determina o tipo da variável com base no primeiro caractere
                    switch (firstChar) {
                        case 'O':
                            variableType = 'Object (Objeto)';
                            break;
                        case 'A':
                            variableType = 'Array (Matriz)';
                            break;
                        case 'B':
                            variableType = 'Code Block (Bloco de Código)';
                            break;
                        case 'C':
                            variableType = 'Character (Caractere)';
                            break;
                        case 'D':
                            variableType = 'Date (Data)';
                            break;
                        case 'F':
                            variableType = 'Fixed Size Decimal (Decimal de Tamanho Fixo)';
                            break;
                        case 'L':
                            variableType = 'Logical (Lógico)';
                            break;
                        case 'N':
                            variableType = 'Numeric (Numérico)';
                            break;
                        default:
                            variableType = 'Tipo desconhecido';
                            break;
                    }

                    const variableItem = new vscode.CompletionItem(variableName, vscode.CompletionItemKind.Variable);
                    variableItem.detail = `${variableType} - ${declarationType} - ${initialValue ? `Valor inicial: ${initialValue}` : 'Sem valor inicial'}`;
                    variableItem.documentation = new vscode.MarkdownString(`**Tipo:** ${variableType}\n**Escopo:** ${declarationType}\n${initialValue ? `**Valor inicial:** \`${initialValue}\`` : ''}`);
                    completionItems.push(variableItem);
                });

                // Itera sobre as classes no arquivo JSON
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

    context.subscriptions.push(hoverProvider);
    context.subscriptions.push(completionProvider);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
