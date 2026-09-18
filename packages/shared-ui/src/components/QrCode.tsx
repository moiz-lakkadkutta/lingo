import React, { useMemo } from 'react'
import { View } from 'react-native'
// react-native-svg is on Amazon's Vega supported list (Expo 54: 15.12.1; Vega: @amazon-devices/react-native-svg via a Metro alias):
// https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html
import Svg, { Path, Rect } from 'react-native-svg'
import { buildQrMatrix, qrPath } from '../lib/qr'
import { tokens } from '../theme/tokens'
import { px } from '../theme/scale'

export interface QrCodeProps {
  value: string
  /** px at 1920×1080; scaled with px(). */
  sizePx: number
  /** aria-label of purpose, e.g. strings.pair.qrLabel(code). */
  label: string
  testID?: string
}

/** Dark modules on tokens.color.text (never pure white). One <Path> for all modules keeps the SVG layer cheap on TV. Not focusable: nothing to press. */
export function QrCode({ value, sizePx, label, testID }: QrCodeProps) {
  const { d, size } = useMemo(() => qrPath(buildQrMatrix(value)), [value])
  return (
    <View accessibilityRole="image" aria-label={label} testID={testID} style={{ width: px(sizePx), height: px(sizePx), borderRadius: 8, overflow: 'hidden' }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
        <Rect x={0} y={0} width={size} height={size} fill={tokens.color.text} />
        <Path d={d} fill={tokens.color.ground} />
      </Svg>
    </View>
  )
}
