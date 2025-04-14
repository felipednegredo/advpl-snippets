const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

function activate(context) {
    let descriptions = {};
    let classesData = {};
    let cache = null; // Cache para melhorar a performance

    // Tenta carregar o arquivo functionsDescriptions.json
    try {
        const descriptionsPath = path.join(__dirname, 'functionsDescriptions.json');
        const rawDescriptions = JSON.parse(fs.readFileSync(descriptionsPath, 'utf8'));
        descriptions = Object.fromEntries(
            Object.entries(rawDescriptions).map(([key, value]) => [key.toLowerCase(), value])
        );
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

    // Função para exibir o conteúdo do arquivo servers.json em um WebView
    let disposable = vscode.commands.registerCommand('extension.showServers', () => {
        const panel = vscode.window.createWebviewPanel(
            'serverView',
            'Servers View',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        const filePath = path.join(vscode.workspace.rootPath || '', 'servers.json');
        const data = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '{}';

        panel.webview.html = getWebviewContent(data);
    });
    context.subscriptions.push(disposable);

    function getWebviewContent(jsonData) {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Servers</title>
            <script>
                const data = ${jsonData};
                window.onload = () => {
                    document.getElementById('content').innerText = JSON.stringify(data, null, 2);
                };
            </script>
        </head>
        <body>
            <h1>Servers</h1>
            <pre id="content"></pre>
        </body>
        </html>`;
    }


    const hoverProvider = vscode.languages.registerHoverProvider('advpl', {
        provideHover(document, position, token) {
            try {
                const range = document.getWordRangeAtPosition(position, /\b\w+\b/);
                if (!range) {
                    return null;
                }
    
                const word = document.getText(range).trim().toLowerCase(); // Converte a palavra para minúsculas
                if (!word) {
                    return null;
                }
    
                // Verifica se a função está no arquivo functionsDescriptions.json (ignora case)
                const funcInfo = descriptions[word];
                if (funcInfo) {
                    const markdown = new vscode.MarkdownString();
                    markdown.appendMarkdown(`## ${word.replace(/\b\w/g, char => char.toUpperCase())}\n`);
                    markdown.appendMarkdown(`${funcInfo.description}\n\n`);
    
                    if (funcInfo.parameters && Object.keys(funcInfo.parameters).length > 0) {
                        markdown.appendMarkdown('#### Parâmetros:\n');
                        for (const [paramName, paramInfo] of Object.entries(funcInfo.parameters)) {
                            markdown.appendMarkdown(`- \`${paramName}\` (${paramInfo.type}): ${paramInfo.description}\n`);
                        }
                    } else {
                        markdown.appendMarkdown('Sem parâmetros.\n');
                    }
    
                    if (funcInfo.returns) {
                        markdown.appendMarkdown('\n#### Retorno:\n');
                        markdown.appendMarkdown(`- (${funcInfo.returns.type}): ${funcInfo.returns.description}\n`);
                    } else {
                        markdown.appendMarkdown('Sem retorno.\n');
                    }
    
                    if (funcInfo.example) {
                        markdown.appendMarkdown('\n#### Exemplo:\n');
                        markdown.appendCodeblock(funcInfo.example, 'advpl');
                    }
    
                    if (funcInfo.documentation) {
                        markdown.appendMarkdown(`\n[Documentação completa](${funcInfo.documentation})\n`);
                    }
    
                    markdown.isTrusted = true;
                    return new vscode.Hover(markdown);
                }
    
                // Caso não seja uma função padrão, verifica no código atual
                const text = document.getText();
                const functionRegex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)/gi;
                let match;
    
                while ((match = functionRegex.exec(text)) !== null) {
                    const functionName = match[2];
                    if (functionName.toLowerCase() === word) { // Ignora case na comparação
                        const markdown = new vscode.MarkdownString();
                        markdown.appendMarkdown(`### ${functionName}\n`);
                        markdown.appendMarkdown(`Função definida pelo usuário.\n\n`);
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
// ...existing code...

// Registra o CompletionItemProvider para classes, métodos e variáveis
const completionProvider = vscode.languages.registerCompletionItemProvider(
    { language: 'advpl', scheme: 'file' },
    {
        provideCompletionItems(document) {
            if (!cache) {
                cache = { functions: [], variables: [], defines: [], classes: [] };

                const text = document.getText();
                const variableRegex = /\b(?:LOCAL|STATIC|PUBLIC|PRIVATE)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*:=\s*(.+))?/gi;
                const defineRegex = /#DEFINE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(.+)/gi;
                const functionRegex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)/gi;

                let match;

                // Captura funções
                while ((match = functionRegex.exec(text)) !== null) {
                    const functionType = match[1];
                    const functionName = match[2];
                    const parameters = match[3] ? match[3].split(',').map(param => param.trim()) : [];

                    const functionItem = new vscode.CompletionItem(functionName, vscode.CompletionItemKind.Function);
                    functionItem.detail = `${functionType} definida pelo usuário`;
                    functionItem.documentation = new vscode.MarkdownString(
                        `**Tipo:** ${functionType}\n**Parâmetros:** ${parameters.length > 0 ? parameters.join(', ') : 'Nenhum'}`
                    );

                    if (parameters.length > 0) {
                        functionItem.insertText = new vscode.SnippetString(
                            `${functionName}(${parameters.map((param, index) => `\${${index + 1}:${param}}`).join(', ')})`
                        );
                    } else {
                        functionItem.insertText = `${functionName}()`;
                    }

                    cache.functions.push(functionItem);
                }

                // Captura variáveis
                while ((match = variableRegex.exec(text)) !== null) {
                    const variableName = match[1];
                    const initialValue = match[2] ? match[2].trim() : null;
                    const declarationType = match[0].split(/\s+/)[0].toUpperCase();

                    const variableItem = new vscode.CompletionItem(variableName, vscode.CompletionItemKind.Variable);
                    variableItem.detail = `${declarationType} - ${initialValue ? `Valor inicial: ${initialValue}` : 'Sem valor inicial'}`;
                    variableItem.documentation = new vscode.MarkdownString(`**Escopo:** ${declarationType}\n${initialValue ? `**Valor inicial:** \`${initialValue}\`` : ''}`);
                    cache.variables.push(variableItem);
                }

                // Captura defines
                while ((match = defineRegex.exec(text)) !== null) {
                    const defineName = match[1];
                    const defineValue = match[2].trim();

                    const defineItem = new vscode.CompletionItem(defineName, vscode.CompletionItemKind.Constant);
                    defineItem.detail = `Define - Valor: ${defineValue}`;
                    defineItem.documentation = new vscode.MarkdownString(`**Define:** ${defineName}\n**Valor:** \`${defineValue}\``);
                    cache.defines.push(defineItem);
                }

                // Captura classes e seus métodos
                const loadedClassesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'classesMethods.json'), 'utf8'));
                for (const [className, classInfo] of Object.entries(loadedClassesData)) {
                    const classItem = new vscode.CompletionItem(className, vscode.CompletionItemKind.Class);
                    classItem.detail = `Classe: ${classInfo.description}`;
                    classItem.documentation = new vscode.MarkdownString(`**Descrição:** ${classInfo.description}`);
                    cache.classes.push(classItem);
                }
            }

            return [...cache.functions, ...cache.variables, ...cache.defines, ...cache.classes];
        },

        resolveCompletionItem(item, token) {
            // Verifica se o item é uma classe e sugere métodos ao digitar "."
            if (item.kind === vscode.CompletionItemKind.Class) {
                const className = item.label.toString(); // Ensure label is treated as a string

                if (classesData[className]) {
                    const methods = classesData[className].methods;
                    const methodName = Object.keys(methods)[0]; // Retorna o primeiro método como exemplo
                    const methodInfo = methods[methodName];

                    const methodItem = new vscode.CompletionItem(methodName, vscode.CompletionItemKind.Method);
                    methodItem.detail = `Método: ${methodInfo.description}`;
                    methodItem.documentation = new vscode.MarkdownString(`**Descrição:** ${methodInfo.description}`);
                    if (methodInfo.parameters) {
                        methodItem.insertText = new vscode.SnippetString(
                            `${methodName}(${methodInfo.parameters.map((param, index) => `\${${index + 1}:${param}}`).join(', ')})`
                        );
                    } else {
                        methodItem.insertText = `${methodName}()`;
                    }
                    return methodItem;
                }
            }

            return null;
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

        // Captura todo o texto do documento
        const text = document.getText();

        // Calcula a posição atual do cursor
        const position = selection.active;

        // Localiza a linha atual e as linhas anteriores para encontrar a função
        const functionRegex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)/gi;
        let match;
        let functionMatch = null;

        while ((match = functionRegex.exec(text)) !== null) {
            const start = document.positionAt(match.index);
            const end = document.positionAt(match.index + match[0].length);

            // Verifica se o cursor está dentro da função encontrada
            if (position.isAfterOrEqual(start) && position.isBeforeOrEqual(end)) {
                functionMatch = match;
                break;
            }
        }

        if (!functionMatch) {
            vscode.window.showErrorMessage('Nenhuma função encontrada na posição atual.');
            return;
        }

        const functionType = functionMatch[1];
        const functionName = functionMatch[2];
        const parameters = functionMatch[3] ? functionMatch[3].split(',').map(param => param.trim()) : [];

        const documentation = [
            `/*/ {Protheus.doc}`,
            `Descrição: Descreva aqui o propósito da função.`,
            `@type ${functionType.toLowerCase()}`,
            `@since ${new Date().toLocaleDateString()}`,
            `@version 1.0`,
            ...parameters.map(param => `@param ${param}, Tipo desconhecido, Descrição`),
            `@return Tipo, Descrição`,
            `@example`,
            `Exemplo de uso da função.`,
            `@see Referências adicionais.`,
            `/*/`
        ].join('\n');

        editor.edit(editBuilder => {
            // Insere a documentação acima da função encontrada
            const insertPosition = document.positionAt(functionMatch.index);
            editBuilder.insert(insertPosition, documentation + '\n');
        });

        vscode.window.showInformationMessage(`Documentação gerada para a função "${functionName}".`);
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