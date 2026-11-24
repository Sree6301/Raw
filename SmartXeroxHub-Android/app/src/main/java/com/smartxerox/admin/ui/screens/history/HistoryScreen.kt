package com.smartxerox.admin.ui.screens.history

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.smartxerox.admin.data.model.OrderEntity
import com.smartxerox.admin.ui.components.StatusBadge
import com.smartxerox.admin.ui.theme.*

@Composable
fun HistoryScreen(
    orders: List<OrderEntity>
) {
    var searchQuery by remember { mutableStateOf("") }

    val historyOrders = remember(orders, searchQuery) {
        orders.filter { it.isCompleted || it.isCancelled }
            .filter {
                if (searchQuery.isBlank()) true
                else it.orderNumber.contains(searchQuery, ignoreCase = true) ||
                     it.originalFileName.contains(searchQuery, ignoreCase = true)
            }
    }

    val totalCompletedRevenue = remember(orders) {
        orders.filter { it.isCompleted }.sumOf { it.calculatedPrice }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(16.dp)
    ) {
        Text(
            text = "ORDER HISTORY & REPORTS",
            style = MaterialTheme.typography.titleMedium.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp
            ),
            color = TextSecondary
        )

        Spacer(modifier = Modifier.height(12.dp))

        // Revenue Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = SurfaceCard),
            border = BorderStroke(1.dp, SurfaceCardBorder)
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("Total Completed Revenue", color = TextSecondary, fontSize = 12.sp)
                    Text("₹${String.format("%.2f", totalCompletedRevenue)}", fontWeight = FontWeight.Bold, fontSize = 24.sp, color = AccentEmerald)
                }
                Surface(
                    color = AccentEmerald.copy(alpha = 0.15f),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = "${orders.count { it.isCompleted }} Delivered",
                        fontWeight = FontWeight.Bold,
                        color = AccentEmerald,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        fontSize = 12.sp
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Search Bar
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            placeholder = { Text("Search by Order # or File name...") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = TextSecondary) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = TextPrimary,
                unfocusedTextColor = TextPrimary,
                focusedContainerColor = SurfaceCard,
                unfocusedContainerColor = SurfaceCard
            )
        )

        Spacer(modifier = Modifier.height(14.dp))

        if (historyOrders.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No matching history records found", color = TextSecondary)
            }
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(historyOrders, key = { it.id }) { order ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(containerColor = SurfaceCard),
                        border = BorderStroke(1.dp, SurfaceCardBorder)
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text("#${order.orderNumber}", fontWeight = FontWeight.Bold, color = TextPrimary)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("₹${order.calculatedPrice}", color = AccentEmerald, fontWeight = FontWeight.Bold)
                                }
                                Text(order.originalFileName, color = TextSecondary, fontSize = 13.sp, maxLines = 1)
                                Text("${order.serviceType} • ${order.copies} copies • ${order.paperSize}", color = TextMuted, fontSize = 11.sp)
                            }
                            StatusBadge(status = order.status)
                        }
                    }
                }
            }
        }
    }
}
