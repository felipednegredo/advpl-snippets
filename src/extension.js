
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
                const defineRegex = /#DEFINE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(.+)/gi;
                // Expressão regular para capturar funções (STATIC FUNCTION e USER FUNCTION)
                const functionRegex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z][a-zA-Z0-9_]{0,9})\s*\((.*?)\)/gi;

                let match;

                // Captura funções
                while ((match = functionRegex.exec(text)) !== null) {
                    const functionType = match[1]; // Tipo da função (STATIC FUNCTION ou USER FUNCTION)
                    const functionName = match[2]; // Nome da função (até 10 caracteres)
                    const parameters = match[3] ? match[3].split(',').map(param => param.trim()) : []; // Parâmetros da função
            
                    // Cria um CompletionItem para a função
                    const functionItem = new vscode.CompletionItem(functionName, vscode.CompletionItemKind.Function);
                    functionItem.detail = `${functionType} definida pelo usuário`;
                    functionItem.documentation = new vscode.MarkdownString(
                        `**Tipo:** ${functionType}\n**Parâmetros:** ${parameters.length > 0 ? parameters.join(', ') : 'Nenhum'}`
                    );
            
                    // Adiciona os parâmetros como snippet para facilitar a inserção
                    if (parameters.length > 0) {
                        functionItem.insertText = new vscode.SnippetString(
                            `${functionName}(${parameters.map((param, index) => `\${${index + 1}:${param}}`).join(', ')})`
                        );
                    } else {
                        functionItem.insertText = `${functionName}()`;
                    }
            
                    completionItems.push(functionItem);
                }

                
                // Captura variáveis
                while ((match = variableRegex.exec(text)) !== null) {
                    const variableName = match[1]; // Captura o nome da variável
                    const initialValue = match[2] ? match[2].trim() : null; // Captura o valor inicial, se existir
                    const declarationType = match[0].split(/\s+/)[0].toUpperCase(); // Captura o tipo de declaração (LOCAL, STATIC, etc.)
                    variables.add({ variableName, initialValue, declarationType });
                }
                
                // Captura defines
                const defines = new Set();
                while ((match = defineRegex.exec(text)) !== null) {
                    const defineName = match[1]; // Captura o nome do define
                    const defineValue = match[2].trim(); // Captura o valor do define
                    defines.add({ defineName, defineValue });
                }
                
                // Log para verificar as variáveis e defines capturados (para debugging)
                console.log("Variáveis capturadas:", Array.from(variables));
                console.log("Defines capturados:", Array.from(defines));

                // Filtra variáveis para remover aquelas que contenham "function" em qualquer case no nome
                const filteredVariables = Array.from(variables).filter(({ variableName }) => {
                    return !variableName.toLowerCase().includes('function'); // Converte para lowercase e verifica
                });

                // Adiciona variáveis filtradas ao IntelliSense
                filteredVariables.forEach(({ variableName, initialValue, declarationType }) => {
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
                    variableItem.documentation = new vscode.MarkdownString(`**Escopo:** ${declarationType}\n${initialValue ? `**Valor inicial:** \`${initialValue}\`` : ''}`);
                    completionItems.push(variableItem);
                });

                // Adiciona defines ao IntelliSense
                defines.forEach(({ defineName, defineValue }) => {
                    const defineItem = new vscode.CompletionItem(defineName, vscode.CompletionItemKind.Constant);
                    defineItem.detail = `Define - Valor: ${defineValue}`;
                    defineItem.documentation = new vscode.MarkdownString(`**Define:** ${defineName}\n**Valor:** \`${defineValue}\``);
                    completionItems.push(defineItem);
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
