const vscode = require('vscode');
const { collectFunctions, collectVariables, collectDefines, collectClasses } = require('./collectors');



let cache = null;
let classesData = {};

function registerCompletionProvider() {
    return vscode.languages.registerCompletionItemProvider(
        { language: 'advpl', scheme: 'file' },
        {
            provideCompletionItems(document) {
                const text = document.getText();

                // Atualizar o cache dinamicamente
                cache = {
                    functions: collectFunctions(text),
                    variables: collectVariables(text),
                    defines: collectDefines(text),
                    classes: collectClasses(classesData)
                };

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

module.exports = {
    registerCompletionProvider,
    setClassesData: (data) => { classesData = data; }
};