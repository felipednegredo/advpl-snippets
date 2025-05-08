const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { showServersWebView } = require('./webviews/servers');
const { showLaunchWebView } = require('./webviews/launch');
const { registerCompletionProvider } = require('./providers/completationProvider');
const { registerHoverProvider } = require('./providers/hoverProvider');

let descriptions = {};
let classesData = {};

function activate(context) {
    descriptions = loadJson('functionsDescriptions.json', true);
    classesData = loadJson('classesMethods.json');

    context.subscriptions.push(
        vscode.commands.registerCommand('advplSnippets.showServers', () => showServersWebView(context)),
        vscode.commands.registerCommand('advplSnippets.showLaunch', () => showLaunchWebView(context)),
        vscode.commands.registerCommand('advplSnippets.generateDocumentation', generateDocumentation),
        registerHoverProvider(descriptions), // Passa o objeto descriptions corretamente
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