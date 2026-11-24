package com.smartxerox.admin.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = BrandBlue,
    onPrimary = White,
    primaryContainer = BrandBlueDark,
    secondary = AccentCyan,
    background = DarkBackground,
    surface = SurfaceCard,
    surfaceVariant = SurfaceCardBorder,
    onBackground = TextPrimary,
    onSurface = TextPrimary,
    error = AccentRose
)

@Composable
fun SmartXeroxHubTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = Typography,
        content = content
    )
}
