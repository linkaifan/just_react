/** @jsxRuntime classic */
const TEXT_ELEMENT = 'TEXT_ELEMENT'

type Dom = Text | HTMLElement
interface Props {
  [key: string]: unknown
}
interface Element {
  type: string | Function
  props: Props
}
interface Fiber {
  type: string | Function
  alternate: Fiber | null
  props: Props
  dom: Dom | null
  parent: Fiber | null
  child: Fiber | null
  sibling: Fiber | null
  effectTag?: 'PLACEMENT' | 'UPDATE' | 'DELETION'
  hooks?: any[]
}

let currentRoot: Fiber | null = null
let wipRoot: Fiber | null = null
let nextUnitOfWork: Fiber | null = null
const deletions = new Set<Fiber>()

const isEvent = (key: string) => key.startsWith('on')
const isProperty = (key: string) => key !== 'children' && !isEvent(key)
const isNew = (prev: Props, next: Props) => (key: string) => prev[key] !== next[key]
const isGone = (_: Props, next: Props) => (key: string) => !(key in next)

// hooks
let hookFiber: Fiber | null = null
let hookIndex = 0

const createElement = (type: string, props: Props, ...children: []): Element => {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) =>
        typeof child === 'object' ? child : createTextElement(child)
      )
    }
  }
}

const createTextElement = (text: string): Element => {
  return {
    type: TEXT_ELEMENT,
    props: {
      nodeValue: text,
      childrend: []
    }
  }
}

const createDom = (fiber: Fiber): Dom => {
  const { type, props } = fiber!
  const isText = type === TEXT_ELEMENT

  const dom = isText
    ? document.createTextNode(props.nodeValue as string)
    : document.createElement(type as string)
  updateDom(dom, {}, props)

  return dom
}

const updateDom = (dom: any, prevProps: Props, nextProps: Props) => {
  //Remove old or changed event listeners
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2)
      dom.removeEventListener(eventType, prevProps[name] as any)
    })

  // Remove old properties
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = ''
    })

  // Set new or changed properties
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = nextProps[name]
    })

  // Add event listeners
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2)
      dom.addEventListener(eventType, nextProps[name] as any)
    })
}

const commitRoot = () => {
  deletions.forEach(commitWork)
  commitWork(wipRoot!.child)
  currentRoot = wipRoot
  wipRoot = null
}

function commitWork(fiber: Fiber | null) {
  if (!fiber) {
    return
  }

  let domParentFiber = fiber.parent
  while (!domParentFiber!.dom) {
    domParentFiber = domParentFiber!.parent
  }
  const domParent = domParentFiber!.dom

  if (fiber.effectTag === 'PLACEMENT' && fiber.dom != null) {
    domParent.appendChild(fiber.dom)
  } else if (fiber.effectTag === 'UPDATE' && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate!.props, fiber.props)
  } else if (fiber.effectTag === 'DELETION') {
    commitDeletion(fiber, domParent as HTMLElement)
  }

  commitWork(fiber.child)
  commitWork(fiber.sibling)
}

const commitDeletion = (fiber: Fiber, domParent: HTMLElement) => {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom)
  } else {
    // 函数式组件无dom
    commitDeletion(fiber.child!, domParent)
  }
}

const render = (element: Element, container: HTMLElement) => {
  wipRoot = {
    dom: container,
    props: {
      children: [element]
    },
    alternate: currentRoot,
    type: 'wipRoot',
    child: null,
    sibling: null,
    parent: null
  }
  deletions.clear()
  nextUnitOfWork = wipRoot
}

const workLoop = (deadline: IdleDeadline) => {
  let shouldYield = false
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork)
    shouldYield = deadline.timeRemaining() < 1
  }

  if (!nextUnitOfWork && wipRoot) {
    commitRoot()
  }

  requestIdleCallback(workLoop)
}

const performUnitOfWork = (fiber: Fiber): Fiber | null => {
  const isFunctionComponent = fiber.type instanceof Function
  if (isFunctionComponent) {
    updateFunctionComponent(fiber)
  } else {
    updateHostComponent(fiber)
  }

  if (fiber.child) {
    return fiber.child
  }
  let nextFiber: Fiber | null = fiber
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling
    }
    nextFiber = nextFiber.parent
  }
  return null
}

const updateFunctionComponent = (fiber: Fiber) => {
  hookFiber = fiber
  hookIndex = 0
  hookFiber.hooks = []
  const children = [(fiber.type as Function)(fiber.props)]
  reconcileChildren(fiber, children)
}

function useState<T>(initial: T) {
  if (!hookFiber) {
    return []
  }
  const oldHook =
    hookFiber.alternate && hookFiber.alternate.hooks && hookFiber.alternate.hooks[hookIndex!]
  const hook = {
    state: oldHook ? oldHook.state : initial,
    queue: [] as any[]
  }

  // queue为数组，存在一次调用多个setState的case
  const actions = oldHook ? oldHook.queue : []
  actions.forEach((action: any) => {
    hook.state = action(hook.state)
  })

  const setState = (action: any) => {
    hook.queue.push(action)
    wipRoot = {
      dom: currentRoot!.dom,
      props: currentRoot!.props,
      alternate: currentRoot,
      type: 'wipRoot',
      child: null,
      sibling: null,
      parent: null
    }
    nextUnitOfWork = wipRoot
    deletions.clear()
  }

  hookFiber!.hooks!.push(hook)
  hookIndex!++
  return [hook.state, setState]
}

const updateHostComponent = (fiber: Fiber) => {
  if (!fiber.dom) {
    fiber.dom = createDom(fiber)
  }
  reconcileChildren(fiber, fiber.props.children as Element[])
}

const reconcileChildren = (fiber: Fiber, elements: Element[]) => {
  let index = 0
  let oldFiber = fiber.alternate && fiber.alternate.child
  let prevSibling: any = null
  if (!elements) {
    return
  }
  while (index < elements.length || oldFiber !== null) {
    const element = elements[index]
    let newFiber: Fiber | null = null

    const sameType = oldFiber !== null && element !== null && element.type === oldFiber.type

    if (sameType) {
      newFiber = {
        type: oldFiber!.type,
        props: element.props,
        dom: oldFiber!.dom,
        parent: fiber,
        alternate: oldFiber,
        effectTag: 'UPDATE',
        child: null,
        sibling: null
      }
    }
    if (element && !sameType) {
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: fiber,
        alternate: null,
        effectTag: 'PLACEMENT',
        child: null,
        sibling: null
      }
    }
    if (oldFiber && !sameType) {
      oldFiber.effectTag = 'DELETION'
      deletions.add(oldFiber)
    }

    if (oldFiber) {
      oldFiber = oldFiber.sibling
    }

    if (index === 0) {
      fiber.child = newFiber
    } else if (element) {
      prevSibling!.sibling = newFiber
    }

    prevSibling = newFiber
    index++
  }
}

const Didact = {
  createElement,
  render,
  useState
}

/** @jsx Didact.createElement */
const Counter = () => {
  const [state, setState] = Didact.useState(1)

  const onClick = () => {
    setState((c: number) => c + 1)
    setState((c: number) => c + 1)
  }
  return <h1 onClick={onClick}>Count: {state}</h1>
}

const element = <Counter />

const didactRender = () => {
  const container = document.getElementById('app')
  Didact.render(element, container!)
  requestIdleCallback(workLoop)
}

export default didactRender
