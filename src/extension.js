const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

let descriptions = {};
let classesData = {};
let cache = null;

function activate(context) {
    descriptions = loadJson('functionsDescriptions.json', true);
    classesData = loadJson('classesMethods.json');

    context.subscriptions.push(
        vscode.commands.registerCommand('advplSnippets.showServers', showServersWebView),
        vscode.commands.registerCommand('advplSnippets.generateDocumentation', generateDocumentation),
        registerHoverProvider(),
        registerCompletionProvider()
    );
}

function deactivate() {}

function loadJson(fileName, toLowerCaseKeys = false) {
    try {
        const filePath = path.join(__dirname, fileName);
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(content);
        return toLowerCaseKeys
            ? Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k.toLowerCase(), v]))
            : parsed;
    } catch (error) {
        console.error(`Erro ao carregar ${fileName}:`, error.message);
        return {};
    }
}

function showServersWebView() {
    const panel = vscode.window.createWebviewPanel(
        'serverView',
        'Servers View',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const filePath = path.join(workspacePath, 'servers.json');
    const data = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '{}';

    panel.webview.html = getWebviewContent(data);
}

function getWebviewContent(jsonData) {
    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Servers</title>
        <style>
            body { font-family: sans-serif; padding: 1rem; }
            pre { background: #f5f5f5; padding: 1rem; border-radius: 8px; }
        </style>
        <script>
            const data = ${jsonData};
            window.onload = () => {
                document.getElementById('content').innerText = JSON.stringify(data, null, 2);
            };
        </script>
    </head>
    <body>
        <h1>Servidores Configurados</h1>
        <pre id="content"></pre>
    </body>
    </html>`;
}

function registerHoverProvider() {
    return vscode.languages.registerHoverProvider('advpl', {
        provideHover(document, position) {
            try {
                const range = document.getWordRangeAtPosition(position, /\b\w+\b/);
                const word = document.getText(range)?.toLowerCase();

                if (!word) return null;

                const funcInfo = descriptions[word];
                if (funcInfo) return createHoverFromDescription(word, funcInfo);

                const text = document.getText();
                const userFuncRegex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gi;
                let match;

                while ((match = userFuncRegex.exec(text)) !== null) {
                    if (match[2].toLowerCase() === word) {
                        const markdown = new vscode.MarkdownString(`### ${match[2]}\nFunção definida pelo usuário.`);
                        markdown.isTrusted = true;
                        return new vscode.Hover(markdown);
                    }
                }

                return null;
            } catch (err) {
                console.error('Erro no HoverProvider:', err);
                return null;
            }
        }
    });
}

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

function registerCompletionProvider() {
    return vscode.languages.registerCompletionItemProvider(
        { language: 'advpl', scheme: 'file' },
        {
            provideCompletionItems(document) {
                if (cache) return getCachedItems();

                cache = { functions: [], variables: [], defines: [], classes: [] };
                const text = document.getText();

                collectFunctions(text);
                collectVariables(text);
                collectDefines(text);
                collectClasses();

                return getCachedItems();
            },

            resolveCompletionItem(item) {
                if (item.kind === vscode.CompletionItemKind.Class) {
                    const classInfo = classesData[item.label];
                    if (classInfo && classInfo.methods) {
                        const [methodName] = Object.keys(classInfo.methods);
                        const methodInfo = classInfo.methods[methodName];

                        const methodItem = new vscode.CompletionItem(methodName, vscode.CompletionItemKind.Method);
                        methodItem.detail = `Método: ${methodInfo.description}`;
                        methodItem.documentation = new vscode.MarkdownString(`**Descrição:** ${methodInfo.description}`);
                        methodItem.insertText = methodInfo.parameters
                            ? new vscode.SnippetString(`${methodName}(${methodInfo.parameters.map((p, i) => `\${${i + 1}:${p}}`).join(', ')})`)
                            : `${methodName}()`;

                        return methodItem;
                    }
                }
                return null;
            }
        },
        '.', ':'
    );
}

function getCachedItems() {
    return [...cache.functions, ...cache.variables, ...cache.defines, ...cache.classes];
}

function collectFunctions(text) {
    const regex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)/gi;
    let match;
    while ((match = regex.exec(text))) {
        const [type, name, params] = [match[1], match[2], match[3]];
        const paramList = params ? params.split(',').map(p => p.trim()) : [];

        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
        item.detail = `${type} definida pelo usuário`;
        item.documentation = new vscode.MarkdownString(`**Tipo:** ${type}\n**Parâmetros:** ${paramList.join(', ') || 'Nenhum'}`);
        item.insertText = paramList.length
            ? new vscode.SnippetString(`${name}(${paramList.map((p, i) => `\${${i + 1}:${p}}`).join(', ')})`)
            : `${name}()`;

        cache.functions.push(item);
    }
}

function collectVariables(text) {
    const regex = /\b(LOCAL|STATIC|PUBLIC|PRIVATE)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*:=\s*(.+))?/gi;
    let match;
    while ((match = regex.exec(text))) {
        const [type, name, value] = [match[1].toUpperCase(), match[2], match[3]];
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
        item.detail = `${type} - ${value ? `Valor inicial: ${value}` : 'Sem valor inicial'}`;
        item.documentation = new vscode.MarkdownString(`**Escopo:** ${type}\n${value ? `**Valor inicial:** \`${value.trim()}\`` : ''}`);
        cache.variables.push(item);
    }
}

function collectDefines(text) {
    const regex = /#DEFINE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(.+)/gi;
    let match;
    while ((match = regex.exec(text))) {
        const [name, value] = [match[1], match[2]];
        const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Constant);
        item.detail = `Define - Valor: ${value}`;
        item.documentation = new vscode.MarkdownString(`**Define:** ${name}\n**Valor:** \`${value}\``);
        cache.defines.push(item);
    }
}

function collectClasses() {
    for (const [className, classInfo] of Object.entries(classesData)) {
        const item = new vscode.CompletionItem(className, vscode.CompletionItemKind.Class);
        item.detail = `Classe: ${classInfo.description}`;
        item.documentation = new vscode.MarkdownString(`**Descrição:** ${classInfo.description}`);
        cache.classes.push(item);
    }
}

function generateDocumentation() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return vscode.window.showErrorMessage('Nenhum editor ativo encontrado.');

    const text = editor.document.getText();
    const cursor = editor.selection.active;
    const regex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)\s*.*?RETURN\s+([^\s;]+)/gis;

    let match;
    while ((match = regex.exec(text))) {
        const start = editor.document.positionAt(match.index);
        const end = editor.document.positionAt(match.index + match[0].length);
        if (cursor.isAfterOrEqual(start) && cursor.isBeforeOrEqual(end)) {
            const [type, name, params, returnValue] = [match[1], match[2], match[3], match[4]];
            const paramList = params ? params.split(',').map(p => p.trim()) : [];

            const inferType = (identifier) => {
                const firstChar = identifier.charAt(0).toLowerCase();
                switch (firstChar) {
                    case 'c': return 'caractere';
                    case 'n': return 'numérico';
                    case 'a': return 'array';
                    case 'o': return 'objeto';
                    case 'l': return 'lógico';
                    default: return 'tipo desconhecido';
                }
            };

            const docLines = [
                '/*/ {Protheus.doc}',
                `Descrição: Descreva aqui o propósito da função.`,
                `@type ${type.toLowerCase()}`,
                `@since ${new Date().toLocaleDateString()}`,
                `@version 1.0`,
                ...paramList.map(p => `@param ${p}, ${inferType(p)}, Descrição`),
                `@return ${returnValue}, ${inferType(returnValue)}, Descrição`,
                `@example`,
                `Exemplo de uso da função.`,
                `@see Referências adicionais.`,
                '/*/'
            ];

            editor.edit(builder => {
                builder.insert(start, docLines.join('\n') + '\n');
            });

            vscode.window.showInformationMessage(`Documentação gerada para a função "${name}".`);
            return;
        }
    }

    vscode.window.showErrorMessage('Nenhuma função encontrada na posição atual.');
}

module.exports = { activate, deactivate };
