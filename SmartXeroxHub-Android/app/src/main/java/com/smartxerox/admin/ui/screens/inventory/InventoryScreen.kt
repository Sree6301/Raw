package com.smartxerox.admin.ui.screens.inventory

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.smartxerox.admin.SmartXeroxApplication
import com.smartxerox.admin.data.model.InventoryEntity
import com.smartxerox.admin.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun InventoryScreen() {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val app = context.applicationContext as SmartXeroxApplication
    val inventoryRepo = app.inventoryRepository
    val inventoryList by inventoryRepo.inventory.collectAsState(initial = emptyList())

    var restockDialogItem by remember { mutableStateOf<InventoryEntity?>(null) }
    var restockAmount by remember { mutableStateOf("500") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(16.dp)
    ) {
        Text(
            text = "PAPER & MEDIA INVENTORY",
            style = MaterialTheme.typography.titleMedium.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp
            ),
            color = TextSecondary
        )
        Text(
            text = "Physical sheet tracking for HP Smart Tank 589",
            style = MaterialTheme.typography.labelSmall,
            color = TextMuted
        )

        Spacer(modifier = Modifier.height(16.dp))

        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(inventoryList, key = { it.paperType }) { item ->
                InventoryCard(
                    item = item,
                    onRestock = {
                        restockDialogItem = item
                        restockAmount = "500"
                    }
                )
            }
        }
    }

    if (restockDialogItem != null) {
        AlertDialog(
            onDismissRequest = { restockDialogItem = null },
            title = { Text("Restock ${restockDialogItem!!.name}", fontWeight = FontWeight.Bold, color = TextPrimary) },
            text = {
                Column {
                    Text("Enter total sheets available after restock:", color = TextSecondary, fontSize = 13.sp)
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = restockAmount,
                        onValueChange = { restockAmount = it },
                        label = { Text("Sheet Count") },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        )
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val count = restockAmount.toIntOrNull() ?: 500
                        coroutineScope.launch {
                            inventoryRepo.restockPaper(restockDialogItem!!.paperType, count)
                            Toast.makeText(context, "${restockDialogItem!!.name} restocked to $count sheets", Toast.LENGTH_SHORT).show()
                            restockDialogItem = null
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = BrandBlue)
                ) {
                    Text("Save Restock")
                }
            },
            dismissButton = {
                TextButton(onClick = { restockDialogItem = null }) {
                    Text("Cancel", color = TextSecondary)
                }
            },
            containerColor = SurfaceCard
        )
    }
}

@Composable
fun InventoryCard(
    item: InventoryEntity,
    onRestock: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceCard),
        border = BorderStroke(1.dp, if (item.isLowStock) AccentRose else SurfaceCardBorder)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = item.name,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = TextPrimary
                )
                if (item.isLowStock) {
                    Surface(
                        color = AccentRose.copy(alpha = 0.15f),
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Text(
                            text = "LOW STOCK",
                            color = AccentRose,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "${item.currentSheets} Sheets",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (item.isLowStock) AccentRose else AccentEmerald
                    )
                    Text(
                        text = "Threshold: ${item.minThreshold} sheets",
                        fontSize = 12.sp,
                        color = TextMuted
                    )
                }

                Button(
                    onClick = onRestock,
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = BrandBlue)
                ) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Restock")
                }
            }
        }
    }
}
