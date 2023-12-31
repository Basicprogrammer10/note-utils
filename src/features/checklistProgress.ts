import * as vscode from "vscode";

export function register(context: vscode.ExtensionContext) {
  let provider = vscode.languages.registerCodeLensProvider(
    {
      language: "markdown",
      scheme: "file",
    },
    new ChecklistLenseProvider()
  );

  context.subscriptions.push(provider);
}
class ChecklistLenseProvider implements vscode.CodeLensProvider {
  async provideCodeLenses(
    document: vscode.TextDocument
  ): Promise<vscode.CodeLens[]> {
    const lists = findChecklists(document);
    let codeLenses: vscode.CodeLens[] = [];

    for (let list of lists) {
      let [completed, total] = list.completed();
      let message = `${completed}/${total} (${Math.round(
        list.percent() * 100
      )}%)`;

      let completionMessage = getCompletionMessage();
      if (completed === total && completionMessage)
        message += ` ${completionMessage}`;

      const pos = list.items[0].startPos;
      const range = new vscode.Range(pos, pos);
      let codeLens = new vscode.CodeLens(range, {
        title: message,
        command: "",
      });
      codeLenses.push(codeLens);
    }

    return codeLenses;
  }
}

enum State {
  Checked,
  Unchecked,
  None,
}

class ListItem {
  startPos: vscode.Position;
  endPos: vscode.Position;
  state: State;

  constructor(
    startPos: vscode.Position,
    endPos: vscode.Position,
    state: State
  ) {
    this.startPos = startPos;
    this.endPos = endPos;
    this.state = state;
  }
}

class List {
  items: ListItem[];

  constructor(items: ListItem[]) {
    this.items = items;
  }

  completed(): number[] {
    let completed = 0;
    let notCompleted = 0;

    for (let item of this.items) {
      if (item.state == State.Checked) completed++;
      else if (item.state == State.Unchecked) notCompleted++;
    }

    return [completed, completed + notCompleted];
  }

  percent(): number {
    const [completed, total] = this.completed();
    return completed / total;
  }
}

const LIST_REGEX: RegExp = /[ \t]*- (\[ *(.)\ *])? ?(.*)/;

function findChecklists(document: vscode.TextDocument): List[] {
  if (!isEnabled()) return [];

  let lists: List[] = [];
  let working: ListItem[] = [];

  const text = document.getText();
  const lines = text.split("\n");
  let line = -1;

  while (++line < lines.length) {
    const currentLine = lines[line];
    const startPos = new vscode.Position(line, 0);
    const endPos = new vscode.Position(line, currentLine.length);

    if (currentLine.trim() === "") {
      lists.push(new List(working));
      working = [];
    }

    const matches = currentLine.match(LIST_REGEX);
    if (matches) {
      if (
        matches[1] === undefined ||
        (ignoreCrossed() &&
          matches[3].startsWith("~~") &&
          matches[3].endsWith("~~"))
      )
        working.push(new ListItem(startPos, endPos, State.None));
      else
        working.push(
          new ListItem(
            startPos,
            endPos,
            matches[2] === "x" ? State.Checked : State.Unchecked
          )
        );
    } else if (working.length > 0)
      working.push(new ListItem(startPos, endPos, State.None));
  }

  if (working.length > 0) lists.push(new List(working));
  return lists.filter((list) => list.completed()[1] > 0);
}

function isEnabled(): boolean {
  return vscode.workspace
    .getConfiguration()
    .get("note-utils.checklistProgress.enable") as boolean;
}

function ignoreCrossed(): boolean {
  return vscode.workspace
    .getConfiguration()
    .get("note-utils.checklistProgress.ignoreCrossed") as boolean;
}

function getCompletionMessage(): string | undefined {
  const config = vscode.workspace.getConfiguration();
  let enabled = config.get(
    "note-utils.checklistProgress.completionMessage"
  ) as boolean;
  if (!enabled) return undefined;
  return config.get(
    "note-utils.checklistProgress.completionMessageText"
  ) as string;
}
