package com.smartxerox.admin.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.smartxerox.admin.ui.theme.*

/**
 * Stepper for copies/numbers with [-] and [+] arrows.
 * Clamped between min (default 1) and max (default 10) as required by user prompt.
 */
@Composable
fun NumberStepper(
    value: Int,
    onValueChange: (Int) -> Unit,
    min: Int = 1,
    max: Int = 10,
    label: String = "Copies",
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (label.isNotEmpty()) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                color = TextSecondary,
                modifier = Modifier.weight(1f)
            )
        }

        OutlinedIconButton(
            onClick = { if (value > min) onValueChange(value - 1) },
            enabled = value > min,
            shape = RoundedCornerShape(8.dp),
            border = BorderStroke(1.dp, SurfaceCardBorder),
            modifier = Modifier.size(36.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Remove,
                contentDescription = "Decrease",
                tint = if (value > min) TextPrimary else TextMuted,
                modifier = Modifier.size(16.dp)
            )
        }

        Surface(
            shape = RoundedCornerShape(8.dp),
            color = SurfaceCard,
            border = BorderStroke(1.dp, SurfaceCardBorder),
            modifier = Modifier.width(44.dp).height(36.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    text = value.toString(),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary,
                    textAlign = TextAlign.Center
                )
            }
        }

        OutlinedIconButton(
            onClick = { if (value < max) onValueChange(value + 1) },
            enabled = value < max,
            shape = RoundedCornerShape(8.dp),
            border = BorderStroke(1.dp, SurfaceCardBorder),
            modifier = Modifier.size(36.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Add,
                contentDescription = "Increase",
                tint = if (value < max) TextPrimary else TextMuted,
                modifier = Modifier.size(16.dp)
            )
        }
    }
}
