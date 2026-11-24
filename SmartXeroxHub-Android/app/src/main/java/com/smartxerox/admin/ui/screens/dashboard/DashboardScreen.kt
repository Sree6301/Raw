package com.smartxerox.admin.ui.screens.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.smartxerox.admin.data.model.OrderEntity
import com.smartxerox.admin.ui.components.MetricCard
import com.smartxerox.admin.ui.components.StatusBadge
import com.smartxerox.admin.ui.theme.*

@Composable
fun DashboardScreen(
    orders: List<OrderEntity>,
    onNavigateToOrders: () -> Unit,
    onNavigateToDesk: () -> Unit,
    onNavigateToScanner: () -> Unit,
    onOrderClick: (OrderEntity) -> Unit
) {
    val pendingCount = orders.count { !it.isCompleted && !it.isCancelled }
    val duplexCount = orders.count { it.isDuplex && !it.isCompleted }
    val photoCount = orders.count { (it.isPhoto || it.isPassport8) && !it.isCompleted }
    val scanCount = orders.count { it.isScan && !it.isCompleted }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text(
                text = "OPERATOR DASHBOARD",
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp
                ),
                color = TextSecondary
            )
        }

        // Metrics Grid (2x2)
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MetricCard(
                    title = "Pending Queue",
                    value = pendingCount.toString(),
                    subtitle = "Orders waiting action",
                    indicatorColor = AccentAmber,
                    modifier = Modifier.weight(1f)
                )
                MetricCard(
                    title = "Duplex Jobs",
                    value = duplexCount.toString(),
                    subtitle = "Manual double-sided",
                    indicatorColor = AccentCyan,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MetricCard(
                    title = "Photos & Passport",
                    value = photoCount.toString(),
                    subtitle = "4×6 & A4 glossy",
                    indicatorColor = BrandBlue,
                    modifier = Modifier.weight(1f)
                )
                MetricCard(
                    title = "Scan Requests",
                    value = scanCount.toString(),
                    subtitle = "HP Flatbed tasks",
                    indicatorColor = AccentEmerald,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // Quick Actions Row
        item {
            Text(
                text = "QUICK ACTIONS",
                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                color = TextMuted
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                QuickActionButton(
                    icon = Icons.Default.Description,
                    label = "Desk Print",
                    modifier = Modifier.weight(1f),
                    onClick = onNavigateToDesk
                )
                QuickActionButton(
                    icon = Icons.Default.PhotoCamera,
                    label = "Passport 8-Up",
                    modifier = Modifier.weight(1f),
                    onClick = onNavigateToDesk
                )
                QuickActionButton(
                    icon = Icons.Default.DocumentScanner,
                    label = "New Scan",
                    modifier = Modifier.weight(1f),
                    onClick = onNavigateToScanner
                )
            }
        }

        // Live Queue Header
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "ACTIVE LIVE ORDERS (${orders.filter { !it.isCompleted }.size})",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                    color = TextMuted
                )
                Text(
                    text = "View All →",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                    color = BrandBlue,
                    modifier = Modifier.clickable { onNavigateToOrders() }
                )
            }
        }

        // Active Orders List
        val activeList = orders.filter { !it.isCompleted }.take(10)
        if (activeList.isEmpty()) {
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = SurfaceCard)
                ) {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(32.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = AccentEmerald, modifier = Modifier.size(40.dp))
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("All Caught Up!", style = MaterialTheme.typography.titleMedium, color = TextPrimary)
                            Text("No pending print or scan orders", style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
                        }
                    }
                }
            }
        } else {
            items(activeList, key = { it.id }) { order ->
                DashboardOrderRow(order = order, onClick = { onOrderClick(order) })
            }
        }
    }
}

@Composable
fun QuickActionButton(
    icon: ImageVector,
    label: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(10.dp),
        color = SurfaceCard,
        border = androidx.compose.foundation.BorderStroke(1.dp, SurfaceCardBorder),
        modifier = modifier
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(vertical = 12.dp, horizontal = 4.dp)
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = AccentCyan, modifier = Modifier.size(22.dp))
            Spacer(modifier = Modifier.height(6.dp))
            Text(text = label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
        }
    }
}

@Composable
fun DashboardOrderRow(
    order: OrderEntity,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable { onClick() },
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceCard),
        border = androidx.compose.foundation.BorderStroke(1.dp, SurfaceCardBorder)
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            val icon = when {
                order.isScan -> Icons.Default.DocumentScanner
                order.isPassport8 || order.isPhoto -> Icons.Default.PhotoCamera
                else -> Icons.Default.Description
            }
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(BrandBlue.copy(alpha = 0.15f), shape = RoundedCornerShape(8.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = null, tint = AccentCyan, modifier = Modifier.size(20.dp))
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "#${order.orderNumber}",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        color = TextPrimary
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "₹${order.calculatedPrice}",
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = AccentEmerald
                    )
                }
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = order.originalFileName,
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextSecondary,
                    maxLines = 1
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            StatusBadge(status = order.status)
        }
    }
}
