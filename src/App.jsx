import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const ZOOM_STEP = 0.2
const MIN_ZOOM = 0.4
const MAX_ZOOM = 3
const MAX_STAGE_WIDTH = 1000
const MAX_STAGE_HEIGHT = 700
const MAX_UPLOAD_WIDTH = 1000
const DEFAULT_CAVITY_SIZE = 72
const DEFAULT_COLUMN_SPACING = 96
const DEFAULT_ROW_SPACING = 92
const DEFAULT_CAVITY_COLORS = ['#f2cf4a', '#f2cf4a', '#f2cf4a']

function App() {
  const [image, setImage] = useState(null)
  const [cavities, setCavities] = useState([])
  const [zoom, setZoom] = useState(1)
  const [stageSize, setStageSize] = useState({ width: 1000, height: 700 })
  const [imageNaturalSize, setImageNaturalSize] = useState(null)
  const [imageResolution, setImageResolution] = useState(null)
  const [mousePosition, setMousePosition] = useState(null)
  const [isRemoveMode, setIsRemoveMode] = useState(false)
  const [selectedCavityIndices, setSelectedCavityIndices] = useState([])
  const [draggingSelection, setDraggingSelection] = useState(null)
  const [resizingCavityIndex, setResizingIndex] = useState(null)
  const [groupResizeState, setGroupResizeState] = useState(null)
  const [isPanning, setIsPanning] = useState(false)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [panStart, setPanStart] = useState(null)
  const [selectionBox, setSelectionBox] = useState(null)
  const [selectionStart, setSelectionStart] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [cavityShape, setCavityShape] = useState('round')
  const [batchCount, setBatchCount] = useState(2)
  const [batchLayout, setBatchLayout] = useState('paired')
  const [batchSpacing, setBatchSpacing] = useState({
    column: DEFAULT_COLUMN_SPACING,
    row: DEFAULT_ROW_SPACING,
  })
  const [epnInfo, setEpnInfo] = useState({
    name: '',
    epn: '',
  })

  const [numberingOrder, setNumberingOrder] = useState('ltr-down') // ltr-down | ltr-up | rtl-down | rtl-up
  const [numberPlacement, setNumberPlacement] = useState('outward') // outward | inward
  const [activeNav, setActiveNav] = useState('home')
  const editorRef = useRef(null)
  const fileInputRef = useRef(null)
  const colorCommitTimeoutsRef = useRef(new Map())

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

  const getCavityFillStyle = (cavity) => {
    const colors = cavity.colors || DEFAULT_CAVITY_COLORS
    const segmentCount = cavity.segmentCount || 1

    if (cavity.shape !== 'round') {
      return {}
    }

    if (segmentCount === 1) {
      return {
        background: colors[0],
      }
    }

    if (segmentCount === 2) {
      return {
        background: `conic-gradient(from -30deg, ${colors[1]} 0deg 120deg, ${colors[0]} 120deg 360deg)`,
      }
    }

    return {
      background: `conic-gradient(from -30deg, ${colors[0]} 0deg 120deg, ${colors[1]} 120deg 240deg, ${colors[2]} 240deg 360deg)`,
    }
  }

  const fitImageToStage = (width, height) => {
    if (!width || !height) {
      return { width: 1000, height: 700 }
    }

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : MAX_STAGE_WIDTH
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : MAX_STAGE_HEIGHT
    const availableWidth = Math.min(MAX_STAGE_WIDTH, Math.max(viewportWidth - 80, 240))
    const availableHeight = Math.min(MAX_STAGE_HEIGHT, Math.max(viewportHeight - 320, 240))
    const ratio = Math.min(availableWidth / width, availableHeight / height, 1)

    return {
      width: Math.round(width * ratio),
      height: Math.round(height * ratio),
    }
  }

  const getPanBounds = (nextZoom = zoom, nextStageSize = stageSize) => {
    const scaledWidth = nextStageSize.width * nextZoom
    const scaledHeight = nextStageSize.height * nextZoom

    return {
      minX: Math.min(0, nextStageSize.width - scaledWidth),
      maxX: 0,
      minY: Math.min(0, nextStageSize.height - scaledHeight),
      maxY: 0,
    }
  }

  const clampPanOffset = (offset, nextZoom = zoom, nextStageSize = stageSize) => {
    const bounds = getPanBounds(nextZoom, nextStageSize)

    return {
      x: clamp(offset.x, bounds.minX, bounds.maxX),
      y: clamp(offset.y, bounds.minY, bounds.maxY),
    }
  }

  const sortIndicesForEpnLayout = (indices) =>
    [...indices].sort((a, b) => {
      const cavityA = cavities[a]
      const cavityB = cavities[b]

      if (!cavityA || !cavityB) return 0
      if (Math.abs(cavityA.x - cavityB.x) > 2) return cavityA.x - cavityB.x
      return cavityA.y - cavityB.y
    })
    // Returns a Map<cavityIndex, displayNumber> based on chosen ordering
  const computeNumberedCavities = (allCavities, order) => {
    const indexed = allCavities.map((cavity, index) => ({ cavity, index }))

    indexed.sort((a, b) => {
      const { cavity: ca } = a
      const { cavity: cb } = b

      if (order === 'ltr-down') {
        // Left-to-right, top row first, within each row left-to-right
        const rowA = Math.round(ca.y / 10)
        const rowB = Math.round(cb.y / 10)
        if (rowA !== rowB) return rowA - rowB
        return ca.x - cb.x
      }
      if (order === 'ltr-up') {
        // Left-to-right, bottom row first
        const rowA = Math.round(ca.y / 10)
        const rowB = Math.round(cb.y / 10)
        if (rowA !== rowB) return rowB - rowA
        return ca.x - cb.x
      }
      if (order === 'rtl-down') {
        // Right-to-left, top row first
        const rowA = Math.round(ca.y / 10)
        const rowB = Math.round(cb.y / 10)
        if (rowA !== rowB) return rowA - rowB
        return cb.x - ca.x
      }
      if (order === 'rtl-up') {
        // Right-to-left, bottom row first
        const rowA = Math.round(ca.y / 10)
        const rowB = Math.round(cb.y / 10)
        if (rowA !== rowB) return rowB - rowA
        return cb.x - ca.x
      }
      return 0
    })

    const map = new Map()
    indexed.forEach(({ index }, position) => {
      map.set(index, position + 1)
    })
    return map
  }

  const inferSpacingFromSelection = (indices) => {
    const sorted = sortIndicesForEpnLayout(indices)

    if (sorted.length < 2) {
      return {
        column: DEFAULT_COLUMN_SPACING,
        row: DEFAULT_ROW_SPACING,
      }
    }

    let inferredRow = DEFAULT_ROW_SPACING
    let inferredColumn = DEFAULT_COLUMN_SPACING
    const topColumns = []

    for (let i = 0; i < sorted.length; i += 2) {
      const top = cavities[sorted[i]]
      const bottom = cavities[sorted[i + 1]]

      if (top) topColumns.push(top.x)
      if (top && bottom) {
        inferredRow = Math.max(24, Math.round(Math.abs(bottom.y - top.y)))
      }
    }

    if (topColumns.length > 1) {
      inferredColumn = Math.max(24, Math.round(topColumns[1] - topColumns[0]))
    }

    return {
      column: inferredColumn,
      row: inferredRow,
    }
  }

  const inferLayoutFromSelection = (indices) => {
    const selected = indices.map((index) => cavities[index]).filter(Boolean)

    if (selected.length < 2) return 'paired'

    const sameRow = selected.every((cavity) => Math.abs(cavity.y - selected[0].y) < 6)
    if (sameRow) return 'horizontal'

    const sameColumn = selected.every((cavity) => Math.abs(cavity.x - selected[0].x) < 6)
    if (sameColumn) return 'vertical'

    return 'paired'
  }

  const getSelectionBounds = (indices) => {
    const selected = indices.map((index) => cavities[index]).filter(Boolean)
    if (selected.length === 0) return null

    return {
      minX: Math.min(...selected.map((cavity) => cavity.x - cavity.size / 2)),
      maxX: Math.max(...selected.map((cavity) => cavity.x + cavity.size / 2)),
      minY: Math.min(...selected.map((cavity) => cavity.y - cavity.size / 2)),
      maxY: Math.max(...selected.map((cavity) => cavity.y + cavity.size / 2)),
    }
  }

  const activeSingleSelection =
    selectedCavityIndices.length === 1 ? selectedCavityIndices[0] : null
  const hasGroupSelection = selectedCavityIndices.length > 1
  const activeSingleCavity = activeSingleSelection !== null ? cavities[activeSingleSelection] : null

  const selectedGroupBounds = useMemo(() => {
    if (!hasGroupSelection) return null
    return getSelectionBounds(selectedCavityIndices)
  }, [cavities, hasGroupSelection, selectedCavityIndices])

  const numberedCavities = useMemo(
    () => computeNumberedCavities(cavities, numberingOrder),
    [cavities, numberingOrder]
  )

  const singleToolbarPosition = useMemo(() => {
    if (activeSingleSelection === null || !activeSingleCavity) return null

    const left = activeSingleCavity.x - activeSingleCavity.size / 2
    const top = activeSingleCavity.y - activeSingleCavity.size / 2

    return {
      left: clamp(left * zoom + panOffset.x, 16, Math.max(16, stageSize.width - 240)),
      top: clamp(top * zoom + panOffset.y - 70, 16, Math.max(16, stageSize.height - 72)),
    }
  }, [activeSingleCavity, activeSingleSelection, panOffset.x, panOffset.y, stageSize, zoom])

  const groupToolbarPosition = useMemo(() => {
    if (!hasGroupSelection) return null

    const selected = selectedCavityIndices
      .map((index) => cavities[index])
      .filter(Boolean)

    if (selected.length < 2) return null

    const left = Math.min(...selected.map((cavity) => cavity.x - cavity.size / 2))
    const top = Math.min(...selected.map((cavity) => cavity.y - cavity.size / 2))

    return {
      left: clamp(left * zoom + panOffset.x, 16, Math.max(16, stageSize.width - 180)),
      top: clamp(top * zoom + panOffset.y - 62, 16, Math.max(16, stageSize.height - 64)),
    }
  }, [cavities, hasGroupSelection, panOffset.x, panOffset.y, selectedCavityIndices, stageSize, zoom])

  useEffect(() => {
    if (!imageNaturalSize) return

    const updateStageSize = () => {
      setStageSize(fitImageToStage(imageNaturalSize.width, imageNaturalSize.height))
    }

    updateStageSize()
    window.addEventListener('resize', updateStageSize)

    return () => {
      window.removeEventListener('resize', updateStageSize)
    }
  }, [imageNaturalSize])

  useEffect(() => {
    setPanOffset((current) => clampPanOffset(current))
  }, [zoom, stageSize])

  useEffect(() => {
    if (selectedCavityIndices.length > 1) {
      setBatchSpacing(inferSpacingFromSelection(selectedCavityIndices))
      setBatchLayout(inferLayoutFromSelection(selectedCavityIndices))
    }
  }, [selectedCavityIndices])

  useEffect(() => {
    return () => {
      colorCommitTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
      colorCommitTimeoutsRef.current.clear()
    }
  }, [])

  const getPointerPosition = (e) => {
    const rect = editorRef.current.getBoundingClientRect()
    const viewportX = e.clientX - rect.left
    const viewportY = e.clientY - rect.top
    const mouseX = clamp((viewportX - panOffset.x) / zoom, 0, stageSize.width)
    const mouseY = clamp((viewportY - panOffset.y) / zoom, 0, stageSize.height)

    return { mouseX, mouseY, viewportX, viewportY }
  }

  const resetEditorState = () => {
    setCavities([])
    setZoom(1)
    setMousePosition(null)
    setIsRemoveMode(false)
    setSelectedCavityIndices([])
    setPanOffset({ x: 0, y: 0 })
    setPanStart(null)
    setIsPanning(false)
    setDraggingSelection(null)
    setSelectionBox(null)
    setSelectionStart(null)
    setResizingIndex(null)
    setGroupResizeState(null)
    setImageNaturalSize(null)
  }

  const prepareImageForUpload = (source) =>
    new Promise((resolve, reject) => {
      const img = new Image()

      img.onload = () => {
        if (img.naturalWidth <= MAX_UPLOAD_WIDTH) {
          resolve(source)
          return
        }

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const scale = MAX_UPLOAD_WIDTH / img.naturalWidth
        const targetWidth = Math.round(img.naturalWidth * scale)
        const targetHeight = Math.round(img.naturalHeight * scale)

        if (!ctx) {
          resolve(source)
          return
        }

        canvas.width = targetWidth
        canvas.height = targetHeight

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

        resolve(canvas.toDataURL('image/png'))
      }

      img.onerror = () => reject(new Error('Failed to process uploaded image.'))
      img.src = source
    })

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]

    if (!file) return

    await loadFile(file)
    e.target.value = ''
  }

  const loadFile = async (file) => {
    if (!file) return

    const reader = new FileReader()

    reader.onload = async () => {
      try {
        resetEditorState()
        const preparedImage = await prepareImageForUpload(reader.result)
        setImage(preparedImage)
      } catch (error) {
        console.error(error)
        setImage(reader.result)
      }
    }

    reader.readAsDataURL(file)
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    setIsDragOver(false)

    const file = e.dataTransfer.files?.[0]
    if (!file) return

    await loadFile(file)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target
    setImageNaturalSize({ width: naturalWidth, height: naturalHeight })
    setImageResolution({ width: naturalWidth, height: naturalHeight })
    setStageSize(fitImageToStage(naturalWidth, naturalHeight))
    setPanOffset({ x: 0, y: 0 })
  }

  const createCavity = (x, y, shape = cavityShape) => ({
    x,
    y,
    shape,
    segmentCount: 1,
    colors: [...DEFAULT_CAVITY_COLORS],
    size: Math.max(20, Math.min(stageSize.width, stageSize.height, DEFAULT_CAVITY_SIZE)),
  })

  const layoutBatchSequence = (count, shape = cavityShape, layout = batchLayout) => {
    const safeCount = clamp(Number(count) || 1, 1, 200)

    if (layout === 'horizontal') {
      const horizontalSpan = (safeCount - 1) * batchSpacing.column
      const startX = clamp(
        stageSize.width / 2 - horizontalSpan / 2,
        36,
        Math.max(36, stageSize.width - horizontalSpan - 36)
      )
      const y = stageSize.height / 2

      return Array.from({ length: safeCount }, (_, index) =>
        createCavity(startX + index * batchSpacing.column, y, shape)
      )
    }

    if (layout === 'vertical') {
      const verticalSpan = (safeCount - 1) * batchSpacing.row
      const x = stageSize.width / 2
      const startY = clamp(
        stageSize.height / 2 - verticalSpan / 2,
        36,
        Math.max(36, stageSize.height - verticalSpan - 36)
      )

      return Array.from({ length: safeCount }, (_, index) =>
        createCavity(x, startY + index * batchSpacing.row, shape)
      )
    }

    const columns = Math.ceil(safeCount / 2)
    const horizontalSpan = (columns - 1) * batchSpacing.column
    const startX = clamp(
      stageSize.width / 2 - horizontalSpan / 2,
      36,
      Math.max(36, stageSize.width - horizontalSpan - 36)
    )
    const startY = clamp(stageSize.height / 2 - batchSpacing.row / 2, 20, stageSize.height - 20)

    return Array.from({ length: safeCount }, (_, index) => {
      const columnIndex = Math.floor(index / 2)
      const rowIndex = index % 2

      return createCavity(
        startX + columnIndex * batchSpacing.column,
        startY + rowIndex * batchSpacing.row,
        shape
      )
    })
  }

  const addCavities = () => {
    const nextCavities = layoutBatchSequence(batchCount, cavityShape, batchLayout)
    const startIndex = cavities.length

    setCavities([...cavities, ...nextCavities])
    setSelectedCavityIndices(nextCavities.map((_, index) => startIndex + index))
  }

  const removeCavity = (indexToRemove) => {
    setCavities(cavities.filter((_, index) => index !== indexToRemove))
    setSelectedCavityIndices((current) =>
      current
        .filter((index) => index !== indexToRemove)
        .map((index) => (index > indexToRemove ? index - 1 : index))
    )
  }

  const repositionSelection = (indices, nextSpacing = batchSpacing, layout = batchLayout) => {
    const bounds = getSelectionBounds(indices)
    if (!bounds) return

    const sorted = sortIndicesForEpnLayout(indices)

    setCavities((current) => {
      const updated = [...current]

      sorted.forEach((index, itemIndex) => {
        const cavity = updated[index]
        if (!cavity) return

        const radius = cavity.size / 2
        let nextX = bounds.minX + radius
        let nextY = bounds.minY + radius

        if (layout === 'horizontal') {
          nextX = bounds.minX + radius + itemIndex * nextSpacing.column
        } else if (layout === 'vertical') {
          nextY = bounds.minY + radius + itemIndex * nextSpacing.row
        } else {
          const columnIndex = Math.floor(itemIndex / 2)
          const rowIndex = itemIndex % 2
          nextX = bounds.minX + radius + columnIndex * nextSpacing.column
          nextY = bounds.minY + radius + rowIndex * nextSpacing.row
        }

        updated[index] = {
          ...cavity,
          x: clamp(nextX, radius, stageSize.width - radius),
          y: clamp(nextY, radius, stageSize.height - radius),
        }
      })

      return updated
    })
  }

  const updateBatchSpacing = (key, value) => {
    const nextSpacing = {
      ...batchSpacing,
      [key]: Number(value),
    }

    setBatchSpacing(nextSpacing)

    if (selectedCavityIndices.length > 1) {
      repositionSelection(selectedCavityIndices, nextSpacing, batchLayout)
    }
  }

  const updateBatchLayout = (layout) => {
    setBatchLayout(layout)

    if (selectedCavityIndices.length > 1) {
      repositionSelection(selectedCavityIndices, batchSpacing, layout)
    }
  }

  const toggleSelectedShape = (shape) => {
    if (selectedCavityIndices.length === 0) {
      setCavityShape(shape)
      return
    }

    setCavities((current) =>
      current.map((cavity, index) =>
        selectedCavityIndices.includes(index) ? { ...cavity, shape } : cavity
      )
    )
  }

  const updateCavityColors = (index, updater) => {
    setCavities((current) =>
      current.map((cavity, cavityIndex) => {
        if (cavityIndex !== index) return cavity

        const nextColors = updater([...(cavity.colors || DEFAULT_CAVITY_COLORS)])
        return {
          ...cavity,
          colors: nextColors,
        }
      })
    )
  }

  const scheduleCavityColorUpdate = (key, callback) => {
    const existingTimeout = colorCommitTimeoutsRef.current.get(key)
    if (existingTimeout) {
      window.clearTimeout(existingTimeout)
    }

    const timeoutId = window.setTimeout(() => {
      callback()
      colorCommitTimeoutsRef.current.delete(key)
    }, 120)

    colorCommitTimeoutsRef.current.set(key, timeoutId)
  }

  const updateCavityNumericField = (index, field, value) => {
    const nextValue = Number(value)
    if (Number.isNaN(nextValue)) return

    setCavities((current) =>
      current.map((cavity, cavityIndex) => {
        if (cavityIndex !== index) return cavity

        if (field === 'size') {
          const maxRadius = Math.min(
            cavity.x,
            cavity.y,
            stageSize.width - cavity.x,
            stageSize.height - cavity.y
          )

          return {
            ...cavity,
            size: clamp(nextValue, 20, maxRadius * 2),
          }
        }

        const radius = cavity.size / 2

        return {
          ...cavity,
          [field]: clamp(
            nextValue,
            radius,
            field === 'x' ? stageSize.width - radius : stageSize.height - radius
          ),
        }
      })
    )
  }

  const updateSingleCavity = (updater) => {
    if (activeSingleSelection === null) return

    setCavities((current) =>
      current.map((cavity, index) =>
        index === activeSingleSelection ? updater(cavity) : cavity
      )
    )
  }

  const updateSingleShape = (shape) => {
    updateSingleCavity((cavity) => ({ ...cavity, shape }))
  }

  const updateSingleSegmentCount = (segmentCount) => {
    updateSingleCavity((cavity) => ({
      ...cavity,
      segmentCount,
      colors: [
        cavity.colors?.[0] || DEFAULT_CAVITY_COLORS[0],
        cavity.colors?.[1] || cavity.colors?.[0] || DEFAULT_CAVITY_COLORS[1],
        cavity.colors?.[2] || cavity.colors?.[0] || DEFAULT_CAVITY_COLORS[2],
      ],
    }))
  }

  const updateSingleColor = (colorIndex, value) => {
    updateSingleCavity((cavity) => {
      const nextColors = [...(cavity.colors || DEFAULT_CAVITY_COLORS)]
      nextColors[colorIndex] = value

      if (cavity.segmentCount === 1) {
        nextColors[1] = value
        nextColors[2] = value
      }

      return {
        ...cavity,
        colors: nextColors,
      }
    })
  }

  const handleMouseMove = (e) => {
    if (!image) return

    const { mouseX, mouseY, viewportX, viewportY } = getPointerPosition(e)
    setMousePosition({
      x: Math.round(mouseX),
      y: Math.round(mouseY),
    })

    if (draggingSelection) {
      const dx = mouseX - draggingSelection.pointerX
      const dy = mouseY - draggingSelection.pointerY

      let minDx = -Infinity
      let maxDx = Infinity
      let minDy = -Infinity
      let maxDy = Infinity

      draggingSelection.items.forEach(({ cavity }) => {
        const radius = cavity.size / 2
        minDx = Math.max(minDx, radius - cavity.x)
        maxDx = Math.min(maxDx, stageSize.width - radius - cavity.x)
        minDy = Math.max(minDy, radius - cavity.y)
        maxDy = Math.min(maxDy, stageSize.height - radius - cavity.y)
      })

      const safeDx = clamp(dx, minDx, maxDx)
      const safeDy = clamp(dy, minDy, maxDy)

      setCavities((current) => {
        const updated = [...current]

        draggingSelection.items.forEach(({ index, cavity }) => {
          updated[index] = {
            ...cavity,
            x: cavity.x + safeDx,
            y: cavity.y + safeDy,
          }
        })

        return updated
      })
      return
    }

    if (resizingCavityIndex !== null) {
      setCavities((current) => {
        const updated = [...current]
        const cavity = updated[resizingCavityIndex]
        if (!cavity) return current

        const dx = mouseX - cavity.x
        const dy = mouseY - cavity.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        const maxRadius = Math.min(
          cavity.x,
          cavity.y,
          stageSize.width - cavity.x,
          stageSize.height - cavity.y
        )

        updated[resizingCavityIndex] = {
          ...cavity,
          size: clamp(distance * 1, 20, maxRadius * 2),
        }

        return updated
      })
      return
    }

    if (groupResizeState) {
      const dx = mouseX - groupResizeState.pointerX
      const dy = mouseY - groupResizeState.pointerY
      const delta = Math.max(dx, dy) * 0.5

      setCavities((current) => {
        const updated = [...current]

        groupResizeState.items.forEach(({ index, cavity }) => {
          const maxRadius = Math.min(
            cavity.x,
            cavity.y,
            stageSize.width - cavity.x,
            stageSize.height - cavity.y
          )

          updated[index] = {
            ...cavity,
            size: clamp(cavity.size + delta, 20, maxRadius * 2),
          }
        })

        return updated
      })
      return
    }

    if (isPanning && panStart) {
      const nextOffset = {
        x: panStart.originX + (e.clientX - panStart.pointerX),
        y: panStart.originY + (e.clientY - panStart.pointerY),
      }

      setPanOffset(clampPanOffset(nextOffset))
      return
    }

    if (selectionStart) {
      const left = Math.min(selectionStart.viewportX, viewportX)
      const top = Math.min(selectionStart.viewportY, viewportY)
      const width = Math.abs(viewportX - selectionStart.viewportX)
      const height = Math.abs(viewportY - selectionStart.viewportY)

      setSelectionBox({ left, top, width, height })

      const selected = cavities.reduce((indices, cavity, index) => {
        const cavityLeft = cavity.x * zoom + panOffset.x - (cavity.size * zoom) / 2
        const cavityTop = cavity.y * zoom + panOffset.y - (cavity.size * zoom) / 2
        const cavitySize = cavity.size * zoom
        const intersects =
          cavityLeft < left + width &&
          cavityLeft + cavitySize > left &&
          cavityTop < top + height &&
          cavityTop + cavitySize > top

        if (intersects) indices.push(index)
        return indices
      }, [])

      setSelectedCavityIndices(selected)
    }
  }

  const stopActions = () => {
    setDraggingSelection(null)
    setResizingIndex(null)
    setGroupResizeState(null)
    setIsPanning(false)
    setPanStart(null)
    setSelectionStart(null)
    setSelectionBox(null)
  }

  const handleMouseLeave = () => {
    setMousePosition(null)
    stopActions()
  }

  const zoomIn = () => setZoom((current) => clamp(current + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))
  const zoomOut = () => setZoom((current) => clamp(current - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))

  const downloadImage = () => {
    if (!image || !imageResolution) return

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      const scaleX = img.width / stageSize.width
      const scaleY = img.height / stageSize.height

      canvas.width = img.width
      canvas.height = img.height

      if (!ctx) return

      ctx.drawImage(img, 0, 0)

      cavities.forEach((cavity) => {
        const drawX = cavity.x * scaleX
        const drawY = cavity.y * scaleY
        const drawWidth = cavity.size * scaleX
        const drawHeight = cavity.size * scaleY
        const left = drawX - drawWidth / 2
        const top = drawY - drawHeight / 2
        const colors = cavity.colors || DEFAULT_CAVITY_COLORS
        const segmentCount = cavity.segmentCount || 1

        ctx.save()
        ctx.beginPath()

        if (cavity.shape === 'square') {
          ctx.rect(left, top, drawWidth, drawHeight)
        } else {
          ctx.arc(drawX, drawY, drawWidth / 2, 0, Math.PI * 2)
        }

        ctx.clip()

        if (cavity.shape === 'square') {
          const segmentWidth = drawWidth / segmentCount

          for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
            ctx.fillStyle = `${colors[segmentIndex] || DEFAULT_CAVITY_COLORS[segmentIndex]}aa`
            ctx.fillRect(left + segmentWidth * segmentIndex, top, segmentWidth, drawHeight)
          }
        } else {
          const radius = drawWidth / 2
          const effectiveSegments =
            segmentCount === 2
              ? [
                  { color: colors[1] || DEFAULT_CAVITY_COLORS[1], start: -Math.PI / 6, end: Math.PI / 2 },
                  { color: colors[0] || DEFAULT_CAVITY_COLORS[0], start: Math.PI / 2, end: Math.PI * 11 / 6 },
                ]
              : Array.from({ length: segmentCount }, (_, segmentIndex) => {
                  const angleSize = (Math.PI * 2) / segmentCount
                  const startAngle = -Math.PI / 6 + angleSize * segmentIndex
                  const endAngle = startAngle + angleSize

                  return {
                    color: colors[segmentIndex] || DEFAULT_CAVITY_COLORS[segmentIndex],
                    start: startAngle,
                    end: endAngle,
                  }
                })

          effectiveSegments.forEach((segment) => {
            const startAngle = segment.start
            const endAngle = segment.end

            ctx.beginPath()
            ctx.moveTo(drawX, drawY)
            ctx.arc(drawX, drawY, radius, startAngle, endAngle)
            ctx.closePath()
            ctx.fillStyle = `${segment.color}aa`
            ctx.fill()
          })
        }

        ctx.restore()
        ctx.beginPath()

        if (cavity.shape === 'square') {
          ctx.rect(left, top, drawWidth, drawHeight)
        } else {
          ctx.arc(drawX, drawY, drawWidth / 2, 0, Math.PI * 2)
        }

        ctx.lineWidth = 4
        ctx.strokeStyle = colors[0] || DEFAULT_CAVITY_COLORS[0]
        ctx.stroke()
      })

      const link = document.createElement('a')
      link.download = 'final-image.png'
      link.href = canvas.toDataURL()
      link.click()
    }

    img.src = image
  }

  const editorWidth = stageSize.width
  const editorHeight = stageSize.height

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar__brand">Cavity Editor</div>
        <div className="topbar__nav">
          <button
            type="button"
            className={activeNav === 'home' ? 'active' : ''}
            onClick={() => setActiveNav('home')}
          >
            Home
          </button>
          <button
            type="button"
            className={activeNav === 'epns' ? 'active' : ''}
            onClick={() => setActiveNav('epns')}
          >
            EPNs
          </button>
          <button
            type="button"
            className={activeNav === 'epn' ? 'active' : ''}
            onClick={() => setActiveNav('epn')}
          >
            EPN
          </button>
          <button
            type="button"
            className={activeNav === 'cavity-editor' ? 'active' : ''}
            onClick={() => setActiveNav('cavity-editor')}
          >
            Cavity Editor
          </button>
        </div>
      </div>

      <h1>Cavity Editor</h1>

      <input
        ref={fileInputRef}
        className="sr-only-input"
        type="file"
        accept="image/*"
        onChange={handleUpload}
      />

      {image ? (
        <>
          <div className="workspace-grid">
            <div className="workspace-main">
              <div className="toolbar">
            <button onClick={() => fileInputRef.current?.click()}>Upload New Image</button>

            <div className="toolbar-cluster">
              <span className="toolbar-label">Shape</span>
              <button
                className={cavityShape === 'round' ? 'toolbar-toggle active' : 'toolbar-toggle'}
                onClick={() => setCavityShape('round')}
                type="button"
              >
                Round
              </button>
              <button
                className={cavityShape === 'square' ? 'toolbar-toggle active' : 'toolbar-toggle'}
                onClick={() => setCavityShape('square')}
                type="button"
              >
                Square
              </button>
            </div>

            <div className="toolbar-cluster">
              <span className="toolbar-label">Layout</span>
              <button
                className={batchLayout === 'paired' ? 'toolbar-toggle active' : 'toolbar-toggle'}
                onClick={() => updateBatchLayout('paired')}
                type="button"
              >
                Pair
              </button>
              <button
                className={batchLayout === 'horizontal' ? 'toolbar-toggle active' : 'toolbar-toggle'}
                onClick={() => updateBatchLayout('horizontal')}
                type="button"
              >
                Horizontal
              </button>
              <button
                className={batchLayout === 'vertical' ? 'toolbar-toggle active' : 'toolbar-toggle'}
                onClick={() => updateBatchLayout('vertical')}
                type="button"
              >
                Vertical
              </button>
            </div>

            <div className="toolbar-cluster">
              <span className="toolbar-label">Count</span>
              <input
                type="number"
                min="1"
                max="200"
                value={batchCount}
                onChange={(e) => setBatchCount(clamp(Number(e.target.value) || 1, 1, 200))}
              />
              <button onClick={addCavities} disabled={!image} type="button">
                Add
              </button>
            </div>

            <button
              className={isRemoveMode ? 'danger-button active' : 'danger-button'}
              onClick={() => setIsRemoveMode((current) => !current)}
              disabled={!image || (!isRemoveMode && cavities.length === 0)}
              type="button"
            >
              {isRemoveMode ? 'Done Removing' : 'Remove'}
            </button>

            <button onClick={downloadImage} disabled={!image} type="button">
              Download
            </button>

            <button onClick={downloadImage} disabled={!image} type="button">
              Download
            </button>

            <div className="toolbar-cluster">
              <span className="toolbar-label">Numbering</span>
              <button
                className={numberingOrder === 'ltr-down' ? 'toolbar-toggle active' : 'toolbar-toggle'}
                onClick={() => setNumberingOrder('ltr-down')}
                type="button"
                title="Left→Right, Top→Bottom"
              >
                →↓
              </button>
              <button
                className={numberingOrder === 'ltr-up' ? 'toolbar-toggle active' : 'toolbar-toggle'}
                onClick={() => setNumberingOrder('ltr-up')}
                type="button"
                title="Left→Right, Bottom→Top"
              >
                →↑
              </button>
              <button
                className={numberingOrder === 'rtl-down' ? 'toolbar-toggle active' : 'toolbar-toggle'}
                onClick={() => setNumberingOrder('rtl-down')}
                type="button"
                title="Right→Left, Top→Bottom"
              >
                ←↓
              </button>
              <button
                className={numberingOrder === 'rtl-up' ? 'toolbar-toggle active' : 'toolbar-toggle'}
                onClick={() => setNumberingOrder('rtl-up')}
                type="button"
                title="Right→Left, Bottom→Top"
              >
                ←↑
              </button>
            </div>

            <div className="toolbar-cluster">
              <span className="toolbar-label">Label</span>
              <button
                className={numberPlacement === 'outward' ? 'toolbar-toggle active' : 'toolbar-toggle'}
                onClick={() => setNumberPlacement('outward')}
                type="button"
                title="Number outside cavity"
              >
                Out
              </button>
              <button
                className={numberPlacement === 'inward' ? 'toolbar-toggle active' : 'toolbar-toggle'}
                onClick={() => setNumberPlacement('inward')}
                type="button"
                title="Number inside cavity"
              >
                In
              </button>
            </div>

          </div>

          <div className="editor-shell">
            <div
              className={`editor${isPanning ? ' is-panning' : ''}`}
              ref={editorRef}
              style={{
                width: editorWidth,
                height: editorHeight,
              }}
              onMouseDown={(e) => {
                const isImageSurface = e.currentTarget.contains(e.target)

                if (!isImageSurface) return

                // Ignore clicks on toolbars
                if (e.target.closest('.group-toolbar') || e.target.closest('.single-toolbar')) return

                if (e.shiftKey) {
                  e.preventDefault()
                  setSelectedCavityIndices([])
                  setIsPanning(true)
                  setPanStart({
                    pointerX: e.clientX,
                    pointerY: e.clientY,
                    originX: panOffset.x,
                    originY: panOffset.y,
                  })
                  return
                }

                const { viewportX, viewportY } = getPointerPosition(e)
                setSelectedCavityIndices([])
                setSelectionStart({ viewportX, viewportY })
                setSelectionBox({
                  left: viewportX,
                  top: viewportY,
                  width: 0,
                  height: 0,
                })
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={stopActions}
              onMouseLeave={handleMouseLeave}
            >
              <div
                className="editor-pan"
                style={{
                  width: stageSize.width * zoom,
                  height: stageSize.height * zoom,
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
                }}
              >
                <div
                  className="editor-stage"
                  style={{
                    width: stageSize.width,
                    height: stageSize.height,
                    transform: `scale(${zoom})`,
                  }}
                >
                  <img
                    src={image}
                    alt="Uploaded"
                    className="main-image"
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    onLoad={handleImageLoad}
                    style={{
                      width: stageSize.width,
                      height: stageSize.height,
                    }}
                  />

                  {cavities.map((cavity, index) => (
                    <div
                      key={index}
                      className={[
                        'cavity',
                        `cavity--${cavity.shape}`,
                        isRemoveMode ? 'remove-mode' : '',
                        selectedCavityIndices.includes(index) ? 'is-selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onMouseDown={(e) => {
                        e.stopPropagation()

                        if (isRemoveMode) {
                          setSelectedCavityIndices([index])
                          return
                        }

                        const nextSelection = selectedCavityIndices.includes(index)
                          ? selectedCavityIndices
                          : [index]

                        setSelectedCavityIndices(nextSelection)
                        const { mouseX, mouseY } = getPointerPosition(e)

                        setDraggingSelection({
                          pointerX: mouseX,
                          pointerY: mouseY,
                          items: nextSelection.map((selectedIndex) => ({
                            index: selectedIndex,
                            cavity: cavities[selectedIndex],
                          })),
                        })
                      }}
                      style={{
                        width: cavity.size,
                        height: cavity.size,
                        left: cavity.x - cavity.size / 2,
                        top: cavity.y - cavity.size / 2,
                        borderColor: (cavity.colors || DEFAULT_CAVITY_COLORS)[0],
                      }}
                    >
                      <div
                        className={`cavity-fill cavity-fill--${cavity.segmentCount || 1}`}
                        style={cavity.shape === 'round' ? getCavityFillStyle(cavity) : undefined}
                      >
                        {cavity.shape === 'square' &&
                          ((cavity.segmentCount || 1) > 1
                            ? (cavity.colors || DEFAULT_CAVITY_COLORS).slice(0, cavity.segmentCount || 1)
                            : [(cavity.colors || DEFAULT_CAVITY_COLORS)[0]]
                          ).map((color, segmentIndex) => (
                            <div
                              key={segmentIndex}
                              className={`cavity-fill__segment cavity-fill__segment--${segmentIndex + 1} cavity-fill__segment-count--${cavity.segmentCount || 1}`}
                              style={{ background: color }}
                            />
                          ))}
                      </div>

                      {isRemoveMode && (
                        <button
                          className="remove-cavity"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeCavity(index)
                          }}
                          type="button"
                        >
                          x
                        </button>
                      )}

                        {!isRemoveMode && activeSingleSelection === index && (
                        <div
                          className="resize-handle"
                          onMouseDown={(e) => {
                            e.stopPropagation()
                            setSelectedCavityIndices([index])
                            setResizingIndex(index)
                          }}
                        />
                      )}

                      <span
                        className={`cavity-number cavity-number--${numberPlacement}`}
                        style={{ pointerEvents: 'none' }}
                      >
                        {numberedCavities.get(index)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {groupToolbarPosition && (
                <div
                  className="group-toolbar"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    left: groupToolbarPosition.left,
                    top: groupToolbarPosition.top,
                  }}
                >
                  <button
                    className="group-toolbar__icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleSelectedShape('round')
                    }}
                    type="button"
                    title="Round cavities"
                  >
                    ○
                  </button>
                  <button
                    className="group-toolbar__icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleSelectedShape('square')
                    }}
                    type="button"
                    title="Square cavities"
                  >
                    □
                  </button>
                  <label className="group-toolbar__control" title="Column spacing">
                    <span>↔</span>
                    <input
                      type="range"
                      min="24"
                      max="180"
                      value={batchSpacing.column}
                      onChange={(e) => updateBatchSpacing('column', e.target.value)}
                    />
                  </label>
                  <label className="group-toolbar__control" title="Row spacing">
                    <span>↕</span>
                    <input
                      type="range"
                      min="24"
                      max="180"
                      value={batchSpacing.row}
                      onChange={(e) => updateBatchSpacing('row', e.target.value)}
                    />
                  </label>
                </div>
              )}

              {singleToolbarPosition && activeSingleCavity && (
                <div
                  className="single-toolbar"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    left: singleToolbarPosition.left,
                    top: singleToolbarPosition.top,
                  }}
                >
                  <button
                    className={`group-toolbar__icon${activeSingleCavity.shape === 'round' ? ' is-active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      updateSingleShape('round')
                    }}
                    type="button"
                    title="Round cavity"
                  >
                    O
                  </button>
                  <button
                    className={`group-toolbar__icon${activeSingleCavity.shape === 'square' ? ' is-active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      updateSingleShape('square')
                    }}
                    type="button"
                    title="Square cavity"
                  >
                    []
                  </button>
                  <button
                    className={`group-toolbar__icon${activeSingleCavity.segmentCount === 1 ? ' is-active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      updateSingleSegmentCount(1)
                    }}
                    type="button"
                    title="Solid fill"
                  >
                    1
                  </button>
                  <button
                    className={`group-toolbar__icon${activeSingleCavity.segmentCount === 2 ? ' is-active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      updateSingleSegmentCount(2)
                    }}
                    type="button"
                    title="Split in two"
                  >
                    2
                  </button>
                  <button
                    className={`group-toolbar__icon${activeSingleCavity.segmentCount === 3 ? ' is-active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      updateSingleSegmentCount(3)
                    }}
                    type="button"
                    title="Split in three"
                  >
                    3
                  </button>
                  <div className="single-toolbar__colors">
                    {((activeSingleCavity.segmentCount || 1) > 1
                      ? (activeSingleCavity.colors || DEFAULT_CAVITY_COLORS).slice(0, activeSingleCavity.segmentCount || 1)
                      : [(activeSingleCavity.colors || DEFAULT_CAVITY_COLORS)[0]]
                    ).map((color, colorIndex) => (
                      <label key={colorIndex} className="color-swatch">
                        <input
                          type="color"
                          defaultValue={color}
                          key={`${activeSingleSelection}-${colorIndex}-${color}`}
                          onChange={(e) =>
                            scheduleCavityColorUpdate(`single-${activeSingleSelection}-${colorIndex}`, () =>
                              updateSingleColor(colorIndex, e.target.value)
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {selectedGroupBounds && (
                <div
                  className="group-resize-handle"
                  style={{
                    left:
                      (selectedGroupBounds.maxX * zoom + panOffset.x) - 9,
                    top:
                      (selectedGroupBounds.maxY * zoom + panOffset.y) - 9,
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    const { mouseX, mouseY } = getPointerPosition(e)
                    setGroupResizeState({
                      pointerX: mouseX,
                      pointerY: mouseY,
                      items: selectedCavityIndices.map((index) => ({
                        index,
                        cavity: cavities[index],
                      })),
                    })
                  }}
                />
              )}

              {selectionBox && (
                <div
                  className="selection-box"
                  style={{
                    left: selectionBox.left,
                    top: selectionBox.top,
                    width: selectionBox.width,
                    height: selectionBox.height,
                  }}
                />
              )}
            </div>

            <div className="status-chip resolution-chip">
              {imageResolution
                ? `Resolution: ${imageResolution.width} x ${imageResolution.height}`
                : 'Resolution: -'}
            </div>

            <div className="bottom-right-panel">
              <div className="status-chip position-chip">
                {mousePosition ? `X: ${mousePosition.x}, Y: ${mousePosition.y}` : 'X: -, Y: -'}
              </div>

              <div className="zoom-controls">
                <button onClick={zoomOut} disabled={!image || zoom <= MIN_ZOOM} type="button">
                  -
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button onClick={zoomIn} disabled={!image || zoom >= MAX_ZOOM} type="button">
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

          <section className="epn-panel">
            <div className="epn-form">
              <label className="epn-form__field">
                <span>Name</span>
                <input
                  type="text"
                  value={epnInfo.name}
                  onChange={(e) =>
                    setEpnInfo((current) => ({ ...current, name: e.target.value }))
                  }
                  placeholder="EPN name"
                />
              </label>

              <label className="epn-form__field">
                <span>Epn</span>
                <input
                  type="text"
                  value={epnInfo.epn}
                  onChange={(e) =>
                    setEpnInfo((current) => ({ ...current, epn: e.target.value }))
                  }
                  placeholder="Epn"
                />
              </label>
            </div>

            <div className="cavity-table-wrap">
              <table className="cavity-table">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Position</th>
                    <th>Size</th>
                    <th>Color 1</th>
                    <th>Color 2</th>
                    <th>Color 3</th>
                  </tr>
                </thead>
                <tbody>
                  {cavities.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="cavity-table__empty">
                        No cavities added yet.
                      </td>
                    </tr>
                  ) : (
                    cavities.map((cavity, index) => (
                      <tr key={index}>
                        <td>{numberedCavities.get(index)}</td>
                        <td>
                          <div className="table-number-group">
                            <input
                              type="number"
                              value={Math.round(cavity.x)}
                              onChange={(e) => updateCavityNumericField(index, 'x', e.target.value)}
                            />
                            <input
                              type="number"
                              value={Math.round(cavity.y)}
                              onChange={(e) => updateCavityNumericField(index, 'y', e.target.value)}
                            />
                          </div>
                        </td>
                        <td>
                          <input
                            className="table-size-input"
                            type="number"
                            value={Math.round(cavity.size)}
                            onChange={(e) => updateCavityNumericField(index, 'size', e.target.value)}
                          />
                        </td>
                        {[0, 1, 2].map((colorIndex) => (
                          <td key={colorIndex}>
                            <label className="table-color">
                              <input
                                type="color"
                                defaultValue={(cavity.colors || DEFAULT_CAVITY_COLORS)[colorIndex]}
                                key={`${index}-${colorIndex}-${(cavity.colors || DEFAULT_CAVITY_COLORS)[colorIndex]}`}
                                onChange={(e) =>
                                  scheduleCavityColorUpdate(`table-${index}-${colorIndex}`, () =>
                                    updateCavityColors(index, (nextColors) => {
                                      nextColors[colorIndex] = e.target.value

                                      if ((cavity.segmentCount || 1) === 1) {
                                        nextColors[0] = e.target.value
                                        nextColors[1] = e.target.value
                                        nextColors[2] = e.target.value
                                      }

                                      return nextColors
                                    })
                                  )
                                }
                              />
                            </label>
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </>
      ) : (
        <button
          type="button"
          className={isDragOver ? 'upload-dropzone drag-over' : 'upload-dropzone'}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <span className="upload-dropzone__eyebrow">Start with an image</span>
          <span className="upload-dropzone__title">Upload or drag and drop</span>
          <span className="upload-dropzone__subtitle">
            Choose a photo to open the editor and begin placing cavities.
          </span>
          <span className="upload-dropzone__cta">Browse files</span>
        </button>
      )}
    </div>
  )
}

export default App
