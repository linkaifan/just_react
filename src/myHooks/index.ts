interface IUpdate {
  action: any
  next: null | IUpdate
}

interface IQueue {
  pending: null | IUpdate
}

interface IHook {
  memoizedState: any
  next: null | IHook
  queue: IQueue
}

interface IFiber {
  stateNode: Function
  memoizedState: null | IHook // 组件的hook链表
}

let isMount = true
let workInProgressHook: IHook | null = null

const useState = <T>(initState: T) => {
  let hook: IHook

  // 获取当前 Hook
  if (isMount) {
    // 建立 hook 链表
    hook = {
      memoizedState: initState,
      next: null,
      queue: {
        pending: null
      }
    }
    if (!fiber.memoizedState) {
      fiber.memoizedState = hook
    } else {
      workInProgressHook!.next = hook
    }
    workInProgressHook = hook
  } else {
    hook = workInProgressHook!
    workInProgressHook = workInProgressHook!.next
  }

  let baseState = hook.memoizedState

  if (hook.queue.pending) {
    // pending环状链表 queue.pending指向链表尾部, pending.next为头部
    let firstUpdate = hook.queue.pending.next
    console.log(firstUpdate)

    do {
      const action = firstUpdate!.action
      baseState = action(baseState)
      firstUpdate = firstUpdate!.next
    } while (firstUpdate !== hook.queue.pending.next)

    hook.queue.pending = null
  }

  hook.memoizedState = baseState

  return [baseState, dispatchAction.bind(null, hook.queue)]
}

const dispatchAction = (queue: IQueue, action: any) => {
  const update: IUpdate = {
    action,
    next: null
  }
  // 环状 每次往链表尾部插入 Update queue.pending指向链表尾部, pending.next为头部
  if (queue.pending === null) {
    update.next = update
  } else {
    update.next = queue.pending.next
    queue.pending.next = update
  }
  queue.pending = update

  schedule()
}

const App = () => {
  const [num, updateNum] = useState(0)
  // const [num2, updateNum2] = useState(10)

  console.log(num)

  // console.log(num2)

  return {
    onClick: () => {
      updateNum((state: any) => state + 1)
      updateNum((state: any) => state + 2)
      updateNum((state: any) => state + 3)
    },
    onFocus: () => {
      // updateNum2((state: any) => state + 10)
    }
  }
}

const fiber: IFiber = {
  stateNode: App,
  memoizedState: null
}

const schedule = () => {
  console.log({ ...fiber })
  workInProgressHook = fiber.memoizedState
  const app = fiber.stateNode()
  isMount = false

  return app
}

const global: any = window
global.app = schedule()
