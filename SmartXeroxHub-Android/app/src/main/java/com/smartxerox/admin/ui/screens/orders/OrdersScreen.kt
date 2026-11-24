package com.smartxerox.admin.ui.screens.orders

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
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
import com.smartxerox.admin.data.model.OrderEntity
import com.smartxerox.admin.data.model.PrintJobOptions
import com.smartxerox.admin.hardware.SmartTankPrintAdapter
import com.smartxerox.admin.ui.components.StatusBadge
import com.smartxerox.admin.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun OrdersScreen(
    orders: List<OrderEntity>,
    onClaimAndPrint: suspend (OrderEntity) -> Result<Boolean>,
    onUpdateStatus: (String, String, String) -> Unit,
    onUpdateDuplexStage: (String, String) -> Unit,
    onDownloadAndPrint: suspend (OrderEntity) -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var selectedFilter by remember { mutableStateOf("ALL") }
    var selectedOrderForDetail by remember { mutableStateOf<OrderEntity?>(null) }
    var claimErrorDialog by remember { mutableStateOf<String?>(null) }

    val filteredOrders = remember(orders, selectedFilter) {
        when (selectedFilter) {
            "DOCUMENTS" -> orders.filter { it.isDocument }
            "PHOTOS" -> orders.filter { it.isPhoto && !it.isPassport8 }
            "PASSPORT" -> orders.filter { it.isPassport8 }
            "SCANS" -> orders.filter { it.isScan }
            else -> orders
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(horizontal = 16.dp)
    ) {
        Spacer(modifier = Modifier.height(12.dp))

        // Filter Chips Row
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val filters = listOf(
                "ALL" to "All (${orders.size})",
                "DOCUMENTS" to "Documents (${orders.count { it.isDocument }})",
                "PHOTOS" to "Photos (${orders.count { it.isPhoto && !it.isPassport8 }})",
                "PASSPORT" to "Passport 8-Up (${orders.count { it.isPassport8 }})",
                "SCANS" to "Scans (${orders.count { it.isScan }})"
            )
            items(filters) { (key, label) ->
                FilterChip(
                    selected = selectedFilter == key,
                    onClick = { selectedFilter = key },
                    label = { Text(label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = BrandBlue,
                        selectedLabelColor = White,
                        containerColor = SurfaceCard,
                        labelColor = TextSecondary
                    ),
                    border = FilterChipDefaults.filterChipBorder(
                        borderColor = if (selectedFilter == key) BrandBlue else SurfaceCardBorder,
                        enabled = true,
                        selected = selectedFilter == key
                    )
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Orders List
        if (filteredOrders.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "No orders in this category",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextSecondary
                )
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(filteredOrders, key = { it.id }) { order ->
                    AdminOrderCard(
                        order = order,
                        onCardClick = { selectedOrderForDetail = order },
                        onPrimaryAction = {
                            coroutineScope.launch {
                                val claimRes = onClaimAndPrint(order)
                                if (claimRes.isSuccess) {
                                    onDownloadAndPrint(order)
                                } else {
                                    claimErrorDialog = claimRes.exceptionOrNull()?.message ?: "Order already claimed by another device"
                                }
                            }
                        },
                        onAdvanceDuplex = { nextStage ->
                            onUpdateDuplexStage(order.id, nextStage)
                        }
                    )
                }
            }
        }
    }

    // Duplicate Claim Error Dialog
    if (claimErrorDialog != null) {
        AlertDialog(
            onDismissRequest = { claimErrorDialog = null },
            title = { Text("Duplicate Print Prevented", fontWeight = FontWeight.Bold, color = TextPrimary) },
            text = { Text(claimErrorDialog!!, color = TextSecondary) },
            confirmButton = {
                Button(
                    onClick = { claimErrorDialog = null },
                    colors = ButtonDefaults.buttonColors(containerColor = BrandBlue)
                ) {
                    Text("Understood")
                }
            },
            containerColor = SurfaceCard
        )
    }

    // Order Detail Modal Sheet
    if (selectedOrderForDetail != null) {
        OrderDetailModal(
            order = selectedOrderForDetail!!,
            onDismiss = { selectedOrderForDetail = null },
            onCancelOrder = {
                onUpdateStatus(selectedOrderForDetail!!.id, selectedOrderForDetail!!.serviceType, "CANCEL")
                selectedOrderForDetail = null
            }
        )
    }
}

@Composable
fun AdminOrderCard(
    order: OrderEntity,
    onCardClick: () -> Unit,
    onPrimaryAction: () -> Unit,
    onAdvanceDuplex: (String) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable { onCardClick() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceCard),
        border = BorderStroke(1.dp, SurfaceCardBorder)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "#${order.orderNumber}",
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = TextPrimary
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "₹${order.calculatedPrice}",
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        color = AccentEmerald
                    )
                }
                StatusBadge(status = order.status)
            }

            Spacer(modifier = Modifier.height(8.dp))

            // File Name & Specifications
            Text(
                text = order.originalFileName,
                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
                color = TextPrimary,
                maxLines = 1
            )

            Spacer(modifier = Modifier.height(6.dp))

            // Specs badges
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                SpecPill(text = "${order.copies} ${if (order.copies > 1) "Copies" else "Copy"}")
                SpecPill(text = order.paperSize)
                SpecPill(text = order.colorMode)
                if (order.isDuplex) {
                    SpecPill(text = "Manual Duplex", isHighlight = true)
                }
                if (order.isPassport8) {
                    SpecPill(text = "8-Up Passport", isHighlight = true)
                }
                if (order.isScan) {
                    SpecPill(text = "${order.scannedPagesCount}/${order.requestedPagesCount} Scanned")
                }
            }

            if (order.isPassport8) {
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    color = AccentAmber.copy(alpha = 0.12f),
                    shape = RoundedCornerShape(6.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "⚠️ Insert 4×6 HP Photo Paper into top tray",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = AccentAmber,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Primary Action Button matching Windows .exe
            if (!order.isCompleted && !order.isCancelled) {
                when {
                    order.isDuplex -> {
                        when (order.duplexStage) {
                            "FIRST_SIDE_PRINTING" -> {
                                OutlinedButton(
                                    onClick = {},
                                    enabled = false,
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text("⏳ Printing Odd Pages...", color = AccentCyan)
                                }
                            }
                            "AWAITING_PAPER_REVERSAL", "WAITING_FOR_PHYSICAL_CONFIRMATION" -> {
                                Button(
                                    onClick = { onAdvanceDuplex("PRINTING_SECOND_SIDE") },
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = ButtonDefaults.buttonColors(containerColor = AccentAmber),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text("🔄 2. Paper Reversed (Confirm & Print Other Side)", color = DarkBackground, fontWeight = FontWeight.Bold)
                                }
                            }
                            "PRINTING_SECOND_SIDE" -> {
                                OutlinedButton(
                                    onClick = {},
                                    enabled = false,
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text("⏳ Printing Other Side...", color = AccentCyan)
                                }
                            }
                            else -> {
                                Button(
                                    onClick = onPrimaryAction,
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text("▶ 1. Print Odd Pages (Duplex Step 1)", fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                    order.isPassport8 -> {
                        Button(
                            onClick = onPrimaryAction,
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("🖨️ Approve & Print (4×6 HP Paper)", fontWeight = FontWeight.Bold)
                        }
                    }
                    else -> {
                        Button(
                            onClick = onPrimaryAction,
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("🖨️ Approve & Print", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            } else if (order.isCompleted) {
                OutlinedButton(
                    onClick = onPrimaryAction,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    border = BorderStroke(1.dp, SurfaceCardBorder)
                ) {
                    Text("🖨️ Reprint Order", color = TextSecondary)
                }
            }
        }
    }
}

@Composable
fun SpecPill(text: String, isHighlight: Boolean = false) {
    Surface(
        color = if (isHighlight) AccentCyan.copy(alpha = 0.15f) else DarkBackground,
        shape = RoundedCornerShape(4.dp),
        border = BorderStroke(1.dp, if (isHighlight) AccentCyan else SurfaceCardBorder)
    ) {
        Text(
            text = text,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            color = if (isHighlight) AccentCyan else TextSecondary,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderDetailModal(
    order: OrderEntity,
    onDismiss: () -> Unit,
    onCancelOrder: () -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = SurfaceCard
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Order Details: #${order.orderNumber}",
                    style = MaterialTheme.typography.titleLarge,
                    color = TextPrimary
                )
                StatusBadge(status = order.status)
            }

            Spacer(modifier = Modifier.height(16.dp))

            DetailItem(label = "Original File", value = order.originalFileName)
            DetailItem(label = "Service Type", value = order.serviceType)
            DetailItem(label = "Pages / Count", value = "${order.totalPages} pages")
            DetailItem(label = "Copies", value = "${order.copies}")
            DetailItem(label = "Color Mode", value = order.colorMode)
            DetailItem(label = "Sides Mode", value = if (order.isDuplex) "Manual Duplex (Double Sided)" else "Single Sided")
            DetailItem(label = "Paper Media", value = "${order.paperSize} (${order.paperType})")
            DetailItem(label = "Calculated Price", value = "₹${order.calculatedPrice}")
            if (order.claimedBy != null) {
                DetailItem(label = "Claimed / Printed By", value = order.claimedBy)
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Cancel Order button (if order is cancellable)
            if (listOf("SUBMITTED", "PENDING_ADMIN_APPROVAL", "APPROVED").contains(order.status)) {
                Button(
                    onClick = onCancelOrder,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = AccentRose),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Default.Cancel, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Cancel Order (Auto-disappears)", fontWeight = FontWeight.Bold)
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
        }
    }
}

@Composable
fun DetailItem(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
        Text(text = value, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = TextPrimary)
    }
}
