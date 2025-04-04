
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

function activate(context) {
    let descriptions = {};
    let classesData = {};

    // Tenta carregar o arquivo functionsDescriptions.json
    try {
        const descriptionsPath = path.join(__dirname, 'functionsDescriptions.json');
        console.log('Caminho do arquivo functionsDescriptions.json:', descriptionsPath);
        descriptions = JSON.parse(fs.readFileSync(descriptionsPath, 'utf8'));
        console.log('Conteúdo carregado de functionsDescriptions.json:', descriptions);
    } catch (error) {
        console.error('Erro ao carregar functionsDescriptions.json:', error.message);
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
            try {
                const range = document.getWordRangeAtPosition(position, /\b\w+\b/);
                if (!range) {
                    return null;
                }
        
                const word = document.getText(range).trim();
                if (!word) {
                    return null;
                }
        
                // Captura o texto do documento
                const text = document.getText();
        
                // Expressão regular para capturar os comentários no formato Protheus.doc
                const docRegex = /\/\*\/\s*\{Protheus\.doc\}([\s\S]*?)\/\*\//gi;
                const functionRegex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z][a-zA-Z0-9_]{0,9})\s*\((.*?)\)/gi;
        
                let match;
                let docMatch;
        
                // Procura pela função correspondente
                while ((match = functionRegex.exec(text)) !== null) {
                    const functionName = match[2]; // Nome da função
                    const parameters = match[3] ? match[3].split(',').map(param => param.trim()) : []; // Parâmetros da função
        
                    if (functionName === word) {
                        // Procura pelo comentário imediatamente antes da função
                        const functionStart = match.index;
                        const precedingText = text.substring(0, functionStart);
        
                        docMatch = [...precedingText.matchAll(docRegex)].pop(); // Captura o último comentário antes da função
        
                        const markdown = new vscode.MarkdownString();
                        markdown.appendMarkdown(`### ${functionName}\n`);
                        markdown.appendMarkdown(`Função definida pelo usuário.\n\n`);
        
                        if (docMatch) {
                            const docContent = docMatch[1].trim();
        
                            // Adiciona o conteúdo do comentário ao hover
                            markdown.appendMarkdown('#### Documentação:\n');
                            markdown.appendMarkdown(`${docContent.replace(/@(\w+)/g, '**@$1**')}\n\n`);
                        }
        
                        if (parameters.length > 0) {
                            markdown.appendMarkdown('#### Parâmetros:\n');
                            parameters.forEach(param => {
                                markdown.appendMarkdown(`- \`${param}\`: Descrição do parâmetro\n`);
                            });
                        } else {
                            markdown.appendMarkdown('Sem parâmetros.\n');
                        }
        
                        markdown.isTrusted = true;
                        return new vscode.Hover(markdown);
                    }
                }
        
                return null;
            } catch (error) {
                console.error('Erro no HoverProvider:', error);
                return null;
            }
        }
    });


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

    // Comando para gerar documentação automática
    const generateDocumentationCommand = vscode.commands.registerCommand('advplSnippets.generateDocumentation', () => {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            vscode.window.showErrorMessage('Nenhum editor ativo encontrado.');
            return;
        }

        const document = editor.document;
        const selection = editor.selection;

        // Obtém a linha selecionada ou a linha atual
        const line = document.lineAt(selection.active.line).text;

        // Expressão regular para capturar funções
        const functionRegex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z][a-zA-Z0-9_]{0,9})\s*\((.*?)\)/;
        const match = functionRegex.exec(line);

        if (!match) {
            vscode.window.showErrorMessage('Nenhuma função encontrada na linha atual.');
            return;
        }

        const functionType = match[1]; // STATIC FUNCTION ou USER FUNCTION
        const parameters = match[3] ? match[3].split(',').map(param => param.trim()) : []; // Parâmetros

        // Gera o cabeçalho de documentação
        const documentation = [
            `/*/ {Protheus.doc}`,
            `Descrição: Descreva aqui o propósito da função.`,
            `@type ${functionType.toLowerCase()}`,
            `@author ${process.env.USER}`,
            `@since ${new Date().toLocaleDateString()}`,
            `@version 1.0`,
            ...parameters.map(param => `@param ${param}, Tipo desconhecido, Descrição`),
            `@return Tipo, Descrição`,
            `@example`,
            `Exemplo de uso da função.`,
            `@see Referências adicionais.`,
            `/*/`
        ].join('\n');

        // Insere a documentação acima da função
        editor.edit(editBuilder => {
            const position = new vscode.Position(selection.active.line, 0);
            editBuilder.insert(position, documentation + '\n');
        });

        vscode.window.showInformationMessage('Documentação gerada com sucesso!');
    });


    context.subscriptions.push(generateDocumentationCommand);
    context.subscriptions.push(hoverProvider);
    context.subscriptions.push(completionProvider);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
