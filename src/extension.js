const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

// === Utils ===

function loadJSONFile(filePath, defaultValue = {}) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error(`Erro ao carregar ${filePath}:`, error.message);
        return defaultValue;
    }
}

function buildMarkdownFromFunction(word, funcInfo) {
    const md = new vscode.MarkdownString();
    const title = word.replace(/\b\w/g, char => char.toUpperCase());

    md.appendMarkdown(`## ${title}\n`);
    md.appendMarkdown(`${funcInfo.description}\n\n`);

    if (funcInfo.parameters && Object.keys(funcInfo.parameters).length > 0) {
        md.appendMarkdown('#### Parâmetros\n');
        for (const [name, info] of Object.entries(funcInfo.parameters)) {
            md.appendMarkdown(`- \`${name}\` (${info.type}): ${info.description}\n`);
        }
        md.appendMarkdown('\n');
    } else {
        md.appendMarkdown('_Sem parâmetros._\n\n');
    }

    if (funcInfo.returns) {
        md.appendMarkdown('#### Retorno\n');
        md.appendMarkdown(`- (${funcInfo.returns.type}): ${funcInfo.returns.description}\n\n`);
    } else {
        md.appendMarkdown('_Sem retorno._\n\n');
    }

    if (funcInfo.example) {
        md.appendMarkdown('#### Exemplo\n');
        md.appendCodeblock(funcInfo.example, 'advpl');
    }

    if (funcInfo.documentation) {
        md.appendMarkdown(`\n[🔗 Documentação completa](${funcInfo.documentation})\n`);
    }

    md.isTrusted = true;
    return md;
}

// === Main Extension Activation ===

function activate(context) {
    let cache = null;
    const descriptions = loadJSONFile(path.join(__dirname, 'functionsDescriptions.json'));
    const classesData = loadJSONFile(path.join(__dirname, 'classesMethods.json'));

    // === Hover Provider ===

    const hoverProvider = vscode.languages.registerHoverProvider('advpl', {
        provideHover(document, position) {
            try {
                const range = document.getWordRangeAtPosition(position, /\b\w+\b/);
                if (!range) return null;

                const word = document.getText(range).trim().toLowerCase();
                if (!word) return null;

                const funcInfo = descriptions[word];
                if (funcInfo) return new vscode.Hover(buildMarkdownFromFunction(word, funcInfo));

                // Busca por definição local da função
                const text = document.getText();
                const functionRegex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][\w]*)\s*\(/gi;
                let match;
                while ((match = functionRegex.exec(text)) !== null) {
                    if (match[2].toLowerCase() === word) {
                        const md = new vscode.MarkdownString();
                        md.appendMarkdown(`### ${match[2]}\n_Função definida no próprio código._`);
                        md.isTrusted = true;
                        return new vscode.Hover(md);
                    }
                }

                return null;
            } catch (error) {
                console.error('Erro no HoverProvider:', error);
                return null;
            }
        }
    });

    context.subscriptions.push(hoverProvider);

    // === Completion Provider ===

    const completionProvider = vscode.languages.registerCompletionItemProvider(
        { language: 'advpl', scheme: 'file' },
        {
            provideCompletionItems(document) {
                if (cache) return [...cache.functions, ...cache.variables, ...cache.defines];
                cache = { functions: [], variables: [], defines: [] };

                const text = document.getText();

                const functionRegex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][\w]*)\s*\((.*?)\)/gi;
                const variableRegex = /\b(?:LOCAL|STATIC|PUBLIC|PRIVATE)\s+([a-zA-Z_][\w]*)\s*(?:[:=])?/gi;
                const defineRegex = /#DEFINE\s+([a-zA-Z_][\w]*)\s+(.+)/gi;

                let match;

                while ((match = functionRegex.exec(text)) !== null) {
                    const [type, name, paramsRaw] = [match[1], match[2], match[3]];
                    const params = paramsRaw.split(',').map(p => p.trim()).filter(Boolean);
                    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);

                    item.detail = `${type} definida pelo usuário`;
                    item.documentation = new vscode.MarkdownString(`**Tipo:** ${type}\n**Parâmetros:** ${params.join(', ') || 'Nenhum'}`);
                    item.insertText = params.length
                        ? new vscode.SnippetString(`${name}(${params.map((p, i) => `\${${i + 1}:${p}}`).join(', ')})`)
                        : `${name}()`;

                    cache.functions.push(item);
                }

                while ((match = variableRegex.exec(text)) !== null) {
                    const name = match[1];
                    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
                    item.detail = `Variável`;
                    item.documentation = new vscode.MarkdownString(`**Nome:** ${name}`);
                    cache.variables.push(item);
                }

                while ((match = defineRegex.exec(text)) !== null) {
                    const [name, value] = [match[1], match[2].trim()];
                    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Constant);
                    item.detail = `Define`;
                    item.documentation = new vscode.MarkdownString(`**Valor:** \`${value}\``);
                    cache.defines.push(item);
                }

                return [...cache.functions, ...cache.variables, ...cache.defines];
            },

            resolveCompletionItem(item) {
                if (item.kind === vscode.CompletionItemKind.Class) {
                    const className = item.label.toString();
                    const methods = classesData[className]?.methods;
                    if (!methods) return null;

                    const [name, info] = Object.entries(methods)[0];
                    const methodItem = new vscode.CompletionItem(name, vscode.CompletionItemKind.Method);
                    methodItem.detail = `Método: ${info.description}`;
                    methodItem.documentation = new vscode.MarkdownString(`**Descrição:** ${info.description}`);
                    methodItem.insertText = info.parameters?.length
                        ? new vscode.SnippetString(`${name}(${info.parameters.map((p, i) => `\${${i + 1}:${p}}`).join(', ')})`)
                        : `${name}()`;

                    return methodItem;
                }

                return null;
            }
        },
        '.', ':'
    );

    context.subscriptions.push(completionProvider);

    // === Classe: IntelliSense de Métodos ===

    const classMethodCompletion = vscode.languages.registerCompletionItemProvider('advpl', {
        provideCompletionItems(document, position) {
            const line = document.lineAt(position).text.slice(0, position.character);
            const match = line.match(/([a-z]\w*)[:\.][a-zA-Z_]*/);
            if (!match) return;

            const objName = match[1];
            const fullText = document.getText();
            const classMatch = new RegExp(`${objName}\\s*:=\\s*(?:([\\w]+)\\(|([\\w]+)::New\\()`, 'i').exec(fullText);
            const className = classMatch?.[1] || classMatch?.[2];
            if (!className || !classesData[className]) return;

            return Object.entries(classesData[className].methods || {}).map(([name, info]) => {
                const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Method);
                item.detail = `Classe ${className}`;
                item.documentation = new vscode.MarkdownString(`**${info.description || ''}**`);
                item.insertText = info.parameters?.length
                    ? new vscode.SnippetString(`${name}(${info.parameters.map((p, i) => `\${${i + 1}:${p}}`).join(', ')})`)
                    : new vscode.SnippetString(`${name}()`);

                return item;
            });
        }
    }, ':', '.');

    context.subscriptions.push(classMethodCompletion);

    // === Comando: Gerar Documentação ===

    const generateDocCmd = vscode.commands.registerCommand('advplSnippets.generateDocumentation', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return vscode.window.showErrorMessage('Nenhum editor ativo.');

        const text = editor.document.getText();
        const position = editor.selection.active;

        const regex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][\w]*)\s*\((.*?)\)/gi;
        let match;
        while ((match = regex.exec(text)) !== null) {
            const start = editor.document.positionAt(match.index);
            const end = editor.document.positionAt(match.index + match[0].length);
            if (position.isAfterOrEqual(start) && position.isBeforeOrEqual(end)) {
                const [, type, name, rawParams] = match;
                const params = rawParams.split(',').map(p => p.trim()).filter(Boolean);

                const doc = [
                    `/*/ {Protheus.doc}`,
                    `Descrição: Descreva aqui o propósito da função.`,
                    `@type ${type.toLowerCase()}`,
                    `@since ${new Date().toLocaleDateString()}`,
                    `@version 1.0`,
                    ...params.map(p => `@param ${p}, Tipo desconhecido, Descrição`),
                    `@return Tipo, Descrição`,
                    `@example`,
                    `Exemplo de uso da função.`,
                    `@see Referências adicionais.`,
                    `/*/`
                ].join('\n');

                editor.edit(builder => {
                    builder.insert(start, doc + '\n');
                });

                vscode.window.showInformationMessage(`Documentação gerada para a função "${name}".`);
                return;
            }
        }

        vscode.window.showErrorMessage('Nenhuma função encontrada na posição atual.');
    });

    context.subscriptions.push(generateDocCmd);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
