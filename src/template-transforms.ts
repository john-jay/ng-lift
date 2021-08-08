import * as parse5 from 'parse5';
import { negateExpression, removeCtrlFromExpression, transformNgRepeatExpression } from './template-expression';

export interface ITemplateUpgradeOptions {
    controllerVars: string[];
}

export type AttributeMappingFn = (attr: parse5.Attribute) => parse5.Attribute[];

export interface IAttributeMapping {
    [key: string]: string | AttributeMappingFn;
}

const defaultOptions: ITemplateUpgradeOptions = {
    controllerVars: ['$ctrl'],
};

function isElement(node: parse5.Node): node is parse5.Element {
    return typeof (node as any).childNodes !== 'undefined';
}

function isTextNode(node: parse5.Node): node is parse5.TextNode {
    return node.nodeName === '#text';
}

export const attributeMapping: IAttributeMapping = {
    'ng-checked': '[checked]',
    'ng-class': '[ngClass]',
    'ng-disabled': '[disabled]',
    'ng-hide': '[hidden]',
    'ng-href': 'href',
    'ng-if': '*ngIf',
    'ng-model': '[(ngModel)]',
    'ng-readonly': '[readonly]',
    'ng-repeat': ((attr: parse5.Attribute) => [{
        ...attr,
        name: '*ngFor',
        value: transformNgRepeatExpression(attr.value),
    }]),
    'ng-selected': '[selected]',
    'ng-show': (attr: parse5.Attribute) => [{
        ...attr, name: '[hidden]', value: negateExpression(attr.value),
    }],
    'ng-src': 'src',
    'ng-srcset': 'srcset',
    'ng-style': '[ngStyle]',
    'ng-bind-html': '[innerHTML]',

    // Events
    'ng-blur': '(blur)',
    'ng-change': '(change)',
    'ng-click': '(click)',
    'ng-copy': '(copy)',
    'ng-cut': '(cut)',
    'ng-dblclick': '(dblclick)',
    'ng-focus': '(focus)',
    'ng-keydown': '(keydown)',
    'ng-keypress': '(keypress)',
    'ng-keyup': '(keyup)',
    'ng-mousedown': '(mousedown)',
    'ng-mouseenter': '(mouseenter)',
    'ng-mouseleave': '(mouseleave)',
    'ng-mousemove': '(mousemove)',
    'ng-mouseover': '(mouseover)',
    'ng-mouseup': '(mouseup)',
    'ng-paste': '(paste)',
    'ng-submit': '(submit)',
};

export type NodeMapper = (node: parse5.Element) => parse5.Element;

export function mapElementNodes(root: parse5.Node, mapper: NodeMapper): parse5.Node {
    if (!isElement(root)) {
        return root;
    }

    return mapper({
        ...root,
        childNodes: root.childNodes.map((node) => mapElementNodes(node, mapper)),
    } as parse5.Element);
}

function removeCtrlFromInterpolationExpression(value: string, ctrlVars: string[]) {
    return value.replace(/\{\{([^}]+)\}\}/g,
        (_, expression) => `{{${removeCtrlFromExpression(expression, ctrlVars)}}}`);
}

function removeCtrlFromAttributeExpression(value: string, ctrlVars: string[]) {
    if (/\{\{.+\}\}/.test(value)) {
        return removeCtrlFromInterpolationExpression(value, ctrlVars);
    } else {
        return removeCtrlFromExpression(value, ctrlVars);
    }
}

function removeCtrlFromTextNode(node: parse5.TextNode, ctrlVars: string[]) {
    return {
        ...node,
        value: removeCtrlFromAttributeExpression(node.value, ctrlVars),
    };
}

export function removeCtrlReferences(root: parse5.Node, ctrlVars: string[]): parse5.Node {
    return mapElementNodes(root, (node) => ({
        ...node,
        attrs: node.attrs.map((attr) => ({ ...attr, value: removeCtrlFromAttributeExpression(attr.value, ctrlVars) })),
        childNodes: node.childNodes
            .map((child) => isTextNode(child) ? removeCtrlFromTextNode(child, ctrlVars) : child),
    }));
}

function transformNgAttrExpression(attr: parse5.Attribute) {
    const { name, value } = attr;
    const match = /^\s*\{\{(.+)\}\}\s*$/.exec(value);
    if (match && !match[1].includes('{{')) {
        return {
            ...attr,
            name: `[attr.${name.replace(/^ng-attr-/, '')}]`,
            value: match[1],
        };
    } else {
        return attr;
    }
}

export function upgradeAttributeNames(root: parse5.Node): parse5.Node {
    const mapAttribute = (attr: parse5.Attribute) => {
        const mapping = attributeMapping[attr.name];
        if (!mapping) {
            if (attr.name.startsWith('ng-attr-')) {
                return [transformNgAttrExpression(attr)];
            }
            return [attr];
        }
        if (typeof mapping === 'string') {
            return [{ ...attr, name: mapping }];
        }
        return mapping(attr);
    };

    return mapElementNodes(root, (node) => ({
        ...node,
        attrs: node.attrs.map(mapAttribute).reduce((acc, arr) => acc.concat(arr), []),
    }));
}

export function upgradeTemplate(source: string, options: Partial<ITemplateUpgradeOptions> = {}) {
    const opts = { ...defaultOptions, ...options };
    const parsed = parse5.parse('<body>' + source + '</body>') as parse5.Document;
    const body = (parsed.childNodes[0] as parse5.Element).childNodes[1];
    if (!isElement(body) || (body.tagName !== 'body')) {
        throw new Error('Template parsing failed: body tag missing');
    }
    return parse5.serialize(upgradeAttributeNames(removeCtrlReferences(body, opts.controllerVars)));
}
