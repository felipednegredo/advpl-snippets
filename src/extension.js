const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { showServersWebView } = require('./webviews/servers');
const { showLaunchWebView } = require('./webviews/launch');
const { registerCompletionProvider } = require('./providers/completationProvider')
const { getServerConfigFile, getLaunchConfigFile, isWorkspaceServerConfig, getVSCodePath } = require('./utils/config');

const homedir = require("os").homedir();

let descriptions = {};
let classesData = {};
let cache = null;

function activate(context) {
    descriptions = loadJson('functionsDescriptions.json', true);
    classesData = loadJson('classesMethods.json');

    context.subscriptions.push(
        vscode.commands.registerCommand('advplSnippets.showServers', () => showServersWebView(context)),
        vscode.commands.registerCommand('advplSnippets.showLaunch', () => showLaunchWebView(context)),
        vscode.commands.registerCommand('advplSnippets.generateDocumentation', generateDocumentation),
        registerHoverProvider(),
        registerCompletionProvider(),
        createHoverFromDescription()
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


function registerHoverProvider() {
    return vscode.languages.registerHoverProvider('advpl', {
        provideHover(document, position) {
            try {
                const range = document.getWordRangeAtPosition(position, /\b\w+\b/);
                const word = document.getText(range)?.toLowerCase();

                if (!word) return null;

                const text = document.getText();
                const userFuncRegex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gi;
                let match;

                while ((match = userFuncRegex.exec(text)) !== null) {
                    if (match[2].toLowerCase() === word) {
                        const funcStartIndex = match.index;
                        const funcName = match[2];
                        const markdown = new vscode.MarkdownString(`### ${funcName}\nFunção definida pelo usuário.`);

                        // Extrair comentários acima da função
                        const lines = text.substring(0, funcStartIndex).split('\n').reverse();
                        const commentLines = [];
                        for (const line of lines) {
                            if (line.trim().startsWith('/*') || line.trim().startsWith('//')) {
                                commentLines.push(line.trim().replace(/^\/\*+|\/+|^\*+/g, '').trim());
                            } else if (line.trim() === '' || line.trim().startsWith('*')) {
                                commentLines.push(line.trim().replace(/^\*+/g, '').trim());
                            } else {
                                break;
                            }
                        }

                        // Extrair parâmetros dos comentários
                        const paramRegex = /@param\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*(.+)/gi;
                        const params = [];
                        for (const line of commentLines) {
                            let paramMatch;
                            while ((paramMatch = paramRegex.exec(line)) !== null) {
                                params.push(`- \`${paramMatch[1]}\` (${paramMatch[2]}): ${paramMatch[3]}`);
                            }
                        }

                        if (params.length > 0) {
                            markdown.appendMarkdown('\n#### Parâmetros:\n');
                            markdown.appendMarkdown(params.join('\n') + '\n');
                        }

                        // Extrair informações de retorno dos comentários
                        const returnRegex = /@return\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*(.+)/gi;
                        const returnInfo = [];
                        for (const line of commentLines) {
                            let returnMatch;
                            while ((returnMatch = returnRegex.exec(line)) !== null) {
                                returnInfo.push(`- \`${returnMatch[1]}\` (${returnMatch[2]}): ${returnMatch[3]}`);
                            }
                        }

                        if (returnInfo.length > 0) {
                            markdown.appendMarkdown('\n#### Retorno:\n');
                            markdown.appendMarkdown(returnInfo.join('\n') + '\n');
                        }

                        // Extrair exemplo dos comentários
                        const exampleRegex = /@example\s*(.+)/gi;
                        const examples = [];
                        for (const line of commentLines) {
                            let exampleMatch;
                            while ((exampleMatch = exampleRegex.exec(line)) !== null) {
                                examples.push(exampleMatch[1]);
                            }
                        }

                        if (examples.length > 0) {
                            markdown.appendMarkdown('\n#### Exemplo:\n');
                            markdown.appendMarkdown(examples.join('\n') + '\n');
                        }

                        // Extrair referências dos comentários
                        const seeRegex = /@see\s*(.+)/gi;
                        const references = [];
                        for (const line of commentLines) {
                            let seeMatch;
                            while ((seeMatch = seeRegex.exec(line)) !== null) {
                                references.push(`- ${seeMatch[1]}`);
                            }
                        }

                        if (references.length > 0) {
                            markdown.appendMarkdown('\n#### Referências:\n');
                            markdown.appendMarkdown(references.join('\n') + '\n');
                        }

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

function generateDocumentation() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return vscode.window.showErrorMessage('Nenhum editor ativo encontrado.');

    const text = editor.document.getText();
    const cursor = editor.selection.active;

    // Regex para funções
    const functionRegex = /\b(STATIC FUNCTION|USER FUNCTION)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)/gis;

    // Regex para defines
    const defineRegex = /#DEFINE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(.+)/gi;

    let match;

    // Verificar se o cursor está em uma função
    while ((match = functionRegex.exec(text))) {
        const start = editor.document.positionAt(match.index);
        const end = editor.document.positionAt(match.index + match[0].length);
        if (cursor.isAfterOrEqual(start) && cursor.isBeforeOrEqual(end)) {
            const [type, name, params] = [match[1], match[2], match[3]];
            const paramList = params ? params.split(',').map(p => p.trim()) : [];

            // Procurar o retorno da função
            const functionBodyStart = match.index + match[0].length;
            const functionBody = text.substring(functionBodyStart, text.indexOf('END FUNCTION', functionBodyStart));
            const returnMatch = /\bRETURN\s+([^\s;]+)/i.exec(functionBody);
            const returnValue = returnMatch ? returnMatch[1] : null;

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
                returnValue ? `@return ${returnValue}, ${inferType(returnValue)}, Descrição` : '',
                `@example`,
                `Exemplo de uso da função.`,
                `@see Referências adicionais.`,
                '/*/'
            ].filter(line => line); // Remove linhas vazias

            editor.edit(builder => {
                builder.insert(start, docLines.join('\n') + '\n');
            });

            vscode.window.showInformationMessage(`Documentação gerada para a função "${name}".`);
            return;
        }
    }

    // Verificar se o cursor está em um define
    while ((match = defineRegex.exec(text))) {
        const start = editor.document.positionAt(match.index);
        const end = editor.document.positionAt(match.index + match[0].length);
        if (cursor.isAfterOrEqual(start) && cursor.isBeforeOrEqual(end)) {
            const [name, value] = [match[1], match[2]];

            const docLines = [
                '/*/ {Protheus.doc}',
                `Descrição: Descreva aqui o propósito do define.`,
                `@define ${name}`,
                `@value ${value}`,
                `@since ${new Date().toLocaleDateString()}`,
                `@example`,
                `Exemplo de uso do define.`,
                `@see Referências adicionais.`,
                '/*/'
            ];

            editor.edit(builder => {
                builder.insert(start, docLines.join('\n') + '\n');
            });

            vscode.window.showInformationMessage(`Documentação gerada para o define "${name}".`);
            return;
        }
    }

    vscode.window.showErrorMessage('Nenhuma função ou define encontrada na posição atual.');
}

module.exports = { activate, deactivate };
