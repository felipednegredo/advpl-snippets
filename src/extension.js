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
        descriptions = JSON.parse(fs.readFileSync(descriptionsPath, 'utf8'));
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
    
                // Verifica se a função está no arquivo functionsDescriptions.json
                if (descriptions[word]) {
                    const funcInfo = descriptions[word];
                    const markdown = new vscode.MarkdownString();
                    markdown.appendMarkdown(`### ${word}\n`);
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
                    if (functionName === word) {
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
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        { language: 'advpl', scheme: 'file' },
        {
            provideCompletionItems(document, position) {
                if (!cache) {
                    cache = { functions: [], variables: [], defines: [] };
    
                    // Adiciona as funções padrão do sistema
                    for (const [funcName, funcInfo] of Object.entries(descriptions)) {
                        const functionItem = new vscode.CompletionItem(funcName, vscode.CompletionItemKind.Function);
                        functionItem.detail = funcInfo.description;
                        functionItem.documentation = new vscode.MarkdownString(
                            `**Descrição:** ${funcInfo.description}\n\n` +
                            (funcInfo.parameters && Object.keys(funcInfo.parameters).length > 0
                                ? `**Parâmetros:**\n${Object.entries(funcInfo.parameters)
                                      .map(([paramName, paramInfo]) => `- \`${paramName}\` (${paramInfo.type}): ${paramInfo.description}`)
                                      .join('\n')}\n\n`
                                : 'Sem parâmetros.\n\n') +
                            (funcInfo.returns
                                ? `**Retorno:** (${funcInfo.returns.type}): ${funcInfo.returns.description}\n\n`
                                : '') +
                            (funcInfo.documentation ? `[Documentação completa](${funcInfo.documentation})` : '')
                        );
    
                        // Personaliza o texto inserido no editor
                        if (funcInfo.parameters && Object.keys(funcInfo.parameters).length > 0) {
                            const params = Object.keys(funcInfo.parameters);
                            functionItem.insertText = new vscode.SnippetString(
                                `${funcName}(${params.map((param, index) => `\${${index + 1}:${param}}`).join(', ')})`
                            );
                        } else {
                            functionItem.insertText = `${funcName}()`;
                        }
    
                        cache.functions.push(functionItem);
                    }
    
                    // Adiciona as funções definidas no código atual
                    const text = document.getText();
                    const functionRegex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)/gi;
                    let match;
    
                    while ((match = functionRegex.exec(text)) !== null) {
                        const functionName = match[2];
                        const parameters = match[3] ? match[3].split(',').map(param => param.trim()) : [];
    
                        const functionItem = new vscode.CompletionItem(functionName, vscode.CompletionItemKind.Function);
                        functionItem.detail = `Função definida pelo usuário`;
                        functionItem.documentation = new vscode.MarkdownString(
                            `**Parâmetros:** ${parameters.length > 0 ? parameters.join(', ') : 'Nenhum'}`
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
                }
    
                return [...cache.functions, ...cache.variables, ...cache.defines];
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