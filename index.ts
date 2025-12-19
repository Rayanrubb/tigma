import {
  createCliRenderer,
  RGBA,
  type CliRenderer,
  type KeyEvent,
  type MouseEvent,
  type OptimizedBuffer,
  TextAttributes,
  BoxRenderable,
} from "@opentui/core"

interface Cell {
  char: string
  bold: boolean
}

class CanvasApp {
  private renderer: CliRenderer
  private cursorX = 0
  private cursorY = 0
  private boldMode = false
  private grid: Cell[][] = []
  private canvas: BoxRenderable

  private readonly textColor = RGBA.fromInts(255, 255, 255, 255)
  private readonly boldColor = RGBA.fromInts(255, 255, 100, 255)
  private readonly bgColor = RGBA.fromInts(0, 0, 0, 255)
  private readonly cursorBgColor = RGBA.fromInts(80, 80, 80, 255)

  constructor(renderer: CliRenderer) {
    this.renderer = renderer
    this.initGrid(renderer.terminalWidth, renderer.terminalHeight)

    const self = this

    // Create a full-screen box to receive mouse events and render content
    this.canvas = new BoxRenderable(renderer, {
      id: "canvas",
      width: "100%",
      height: "100%",
      backgroundColor: this.bgColor,
      zIndex: 0,
      onMouse(event: MouseEvent) {
        if (event.type === "down") {
          self.setCursorPosition(event.x, event.y)
        }
      },
      renderAfter(buffer: OptimizedBuffer) {
        self.render(buffer)
      },
    })

    renderer.root.add(this.canvas)
    this.setupInput()

    renderer.on("resize", (width: number, height: number) => {
      this.handleResize(width, height)
    })
  }

  private initGrid(width: number, height: number): void {
    this.grid = []
    for (let y = 0; y < height; y++) {
      const row: Cell[] = []
      for (let x = 0; x < width; x++) {
        row.push({ char: " ", bold: false })
      }
      this.grid.push(row)
    }
  }

  private handleResize(width: number, height: number): void {
    const oldGrid = this.grid
    const oldHeight = oldGrid.length
    const oldWidth = oldHeight > 0 ? oldGrid[0].length : 0

    this.initGrid(width, height)

    // Copy old content
    for (let y = 0; y < Math.min(oldHeight, height); y++) {
      for (let x = 0; x < Math.min(oldWidth, width); x++) {
        this.grid[y][x] = oldGrid[y][x]
      }
    }

    // Clamp cursor position
    this.cursorX = Math.min(Math.max(0, this.cursorX), width - 1)
    this.cursorY = Math.min(Math.max(0, this.cursorY), height - 1)
  }

  private moveCursor(dx: number, dy: number): void {
    const width = this.grid[0]?.length || 0
    const height = this.grid.length
    this.cursorX = Math.max(0, Math.min(width - 1, this.cursorX + dx))
    this.cursorY = Math.max(0, Math.min(height - 1, this.cursorY + dy))
    this.renderer.requestRender()
  }

  private setCursorPosition(x: number, y: number): void {
    const width = this.grid[0]?.length || 0
    const height = this.grid.length
    this.cursorX = Math.max(0, Math.min(width - 1, x))
    this.cursorY = Math.max(0, Math.min(height - 1, y))
    this.renderer.requestRender()
  }

  private typeChar(char: string): void {
    if (this.cursorY < this.grid.length && this.cursorX < this.grid[0].length) {
      this.grid[this.cursorY][this.cursorX] = { char, bold: this.boldMode }
      this.moveCursor(1, 0)
    }
  }

  private deleteChar(): void {
    if (this.cursorY < this.grid.length && this.cursorX < this.grid[0].length) {
      this.grid[this.cursorY][this.cursorX] = { char: " ", bold: false }
      this.renderer.requestRender()
    }
  }

  private toggleBold(): void {
    this.boldMode = !this.boldMode
    this.renderer.requestRender()
  }

  private render(buffer: OptimizedBuffer): void {
    // Draw all cells
    const height = Math.min(this.grid.length, buffer.height)
    for (let y = 0; y < height; y++) {
      const row = this.grid[y]
      const width = Math.min(row?.length || 0, buffer.width)
      for (let x = 0; x < width; x++) {
        const cell = row[x]
        const isCursor = x === this.cursorX && y === this.cursorY
        const bg = isCursor ? this.cursorBgColor : this.bgColor
        const fg = cell.bold ? this.boldColor : this.textColor
        const attrs = cell.bold ? TextAttributes.BOLD : 0

        buffer.setCell(x, y, cell.char, fg, bg, attrs)
      }
    }
  }

  private setupInput(): void {
    this.renderer.keyInput.on("keypress", (key: KeyEvent) => {
      // Cmd+B to toggle bold mode
      if (key.name === "b" && key.meta) {
        this.toggleBold()
        return
      }

      // Arrow keys and backspace for cursor movement
      switch (key.name) {
        case "up":
          this.moveCursor(0, -1)
          return
        case "down":
          this.moveCursor(0, 1)
          return
        case "left":
          this.moveCursor(-1, 0)
          return
        case "right":
          this.moveCursor(1, 0)
          return
        case "backspace":
          // Shift+Backspace deletes at cursor without moving
          // Backspace moves left first, then deletes at new position
          if (key.shift) {
            this.deleteChar()
          } else {
            this.moveCursor(-1, 0)
            this.deleteChar()
          }
          return
      }

      // Type printable characters
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        const code = key.sequence.charCodeAt(0)
        // Printable ASCII range (space to tilde)
        if (code >= 32 && code <= 126) {
          this.typeChar(key.sequence)
        }
      }
    })
  }
}

async function main() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 60,
    useConsole: false,
  })

  renderer.setBackgroundColor(RGBA.fromInts(0, 0, 0, 255))

  new CanvasApp(renderer)

  renderer.start()
}

main()
