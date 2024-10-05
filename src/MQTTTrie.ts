import { AsyncHandlerFunction } from "./types";

export interface TrieNode {
  children: Map<string, TrieNode>;
  handlers: Set<AsyncHandlerFunction>;
  parameterName?: string;
}

export default class MQTTTrie {
  root: TrieNode;

  constructor() {
    this.root = { children: new Map(), handlers: new Set() };
  }

  // Insert a topic pattern into the trie with an optional prefix
  insert(topicPattern: string, handler: AsyncHandlerFunction, prefix: string = '') {
    let node = this.root;
    const fullPattern = prefix ? `${prefix}/${topicPattern}` : topicPattern;
    const levels = fullPattern.split('/');

    for (const level of levels) {
      let key = level;
      let parameterName: string | undefined;

      if (level.startsWith(':')) {
        key = '+';
        parameterName = level.slice(1);
      } else if (level === '+') {
        key = '+';
      } else if (level === '#') {
        key = '#';
      }

      let child = node.children.get(key);
      if (!child) {
        child = { children: new Map(), handlers: new Set(), parameterName };
        node.children.set(key, child);
      }
      node = child;

      if (key === '#') {
        // Multi-level wildcard must be at the end
        break;
      }
    }

    node.handlers.add(handler);
  }

  // Remove a topic pattern and its handler from the trie
  remove(topicPattern: string, handler: AsyncHandlerFunction, prefix: string = '') {
    const fullPattern = prefix ? `${prefix}/${topicPattern}` : topicPattern;
    const levels = fullPattern.split('/');

    const pathStack: { node: TrieNode; key: string }[] = [];
    let node = this.root;

    for (const level of levels) {
      let key = level;

      if (level.startsWith(':') || level === '+') {
        key = '+';
      } else if (level === '#') {
        key = '#';
      }

      const child = node.children.get(key);
      if (!child) {
        // Pattern not found
        return;
      }
      pathStack.push({ node, key });
      node = child;

      if (key === '#') {
        break;
      }
    }

    // Remove the handler
    node.handlers.delete(handler);

    // Clean up the trie by removing empty nodes
    for (let i = pathStack.length - 1; i >= 0; i--) {
      const { node: parentNode, key } = pathStack[i];
      const childNode = parentNode.children.get(key)!;

      if (childNode.handlers.size === 0 && childNode.children.size === 0) {
        parentNode.children.delete(key);
      } else {
        break;
      }
    }
  }

  // Match a topic to the trie and return handlers and parameters
  match(
    topic: string
  ): { handlers: AsyncHandlerFunction[]; params: { [key: string]: string } } | null {
    const levels = topic.split('/');
    const params: { [key: string]: string } = {};
    const handlers: Set<AsyncHandlerFunction> = new Set();

    const search = (node: TrieNode, index: number): void => {
      if (index === levels.length) {
        if (node.handlers.size > 0) {
          for (const handler of node.handlers) {
            handlers.add(handler);
          }
        }
        return;
      }

      const level = levels[index];

      // Exact match
      if (node.children.has(level)) {
        search(node.children.get(level)!, index + 1);
      }

      // Single-level wildcard or parameter
      if (node.children.has('+')) {
        const child = node.children.get('+')!;
        if (child.parameterName) {
          params[child.parameterName] = level;
        }
        search(child, index + 1);
      }

      // Multi-level wildcard
      if (node.children.has('#')) {
        const child = node.children.get('#')!;
        if (child.handlers.size > 0) {
          for (const handler of child.handlers) {
            handlers.add(handler);
          }
        }
      }
    };

    search(this.root, 0);

    if (handlers.size > 0) {
      return { handlers: Array.from(handlers), params };
    } else {
      return null;
    }
  }

  // Merge another trie into this one with a prefix
  merge(otherTrie: MQTTTrie, prefix: string = '') {
    const mergeNodes = (
      target: TrieNode,
      source: TrieNode,
      currentPath: string[]
    ) => {
      for (const [key, sourceChild] of source.children) {
        let targetChild: TrieNode;
        if (!target.children.has(key)) {
          targetChild = {
            children: new Map(),
            handlers: new Set(),
            parameterName: sourceChild.parameterName,
          };
          target.children.set(key, targetChild);
        } else {
          targetChild = target.children.get(key)!;
        }

        mergeNodes(targetChild, sourceChild, [...currentPath, key]);
      }

      // If there are handlers, insert them with the correct prefixed path
      if (source.handlers.size > 0) {
        // Reconstruct the topic pattern
        const topicPattern = currentPath.join('/').replace(/\+/g, ':param');
        const fullPattern = prefix ? `${prefix}/${topicPattern}` : topicPattern;

        // Insert each handler into the target trie at the full pattern
        for (const handler of source.handlers) {
          this.insert(fullPattern, handler);
        }
      }
    };

    mergeNodes(this.root, otherTrie.root, []);
  }
}