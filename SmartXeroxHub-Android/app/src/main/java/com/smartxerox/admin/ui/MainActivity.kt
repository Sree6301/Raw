package com.smartxerox.admin.ui

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.smartxerox.admin.SmartXeroxApplication
import com.smartxerox.admin.data.model.OrderEntity
import com.smartxerox.admin.data.model.PrintJobOptions
import com.smartxerox.admin.hardware.SmartTankPrintAdapter
import com.smartxerox.admin.ui.components.SmartXeroxTopBar
import com.smartxerox.admin.ui.navigation.Screen
import com.smartxerox.admin.ui.screens.dashboard.DashboardScreen
import com.smartxerox.admin.ui.screens.desk.DeskPrintingScreen
import com.smartxerox.admin.ui.screens.history.HistoryScreen
import com.smartxerox.admin.ui.screens.inventory.InventoryScreen
import com.smartxerox.admin.ui.screens.orders.OrdersScreen
import com.smartxerox.admin.ui.screens.scanner.ScannerScreen
import com.smartxerox.admin.ui.screens.settings.SettingsScreen
import com.smartxerox.admin.ui.theme.DarkBackground
import com.smartxerox.admin.ui.theme.SmartXeroxHubTheme
import com.smartxerox.admin.ui.theme.SurfaceCard
import kotlinx.coroutines.launch

data class BottomNavItem(
    val screen: Screen,
    val icon: ImageVector,
    val label: String
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val app = application as SmartXeroxApplication
        val orderRepo = app.orderRepository

        setContent {
            SmartXeroxHubTheme {
                val navController = rememberNavController()
                val navBackStackEntry by navController.currentBackStackEntryAsState()
                val currentRoute = navBackStackEntry?.destination?.route ?: Screen.Dashboard.route
                val coroutineScope = rememberCoroutineScope()

                val orders by orderRepo.allOrders.collectAsState(initial = emptyList())

                val bottomNavItems = listOf(
                    BottomNavItem(Screen.Dashboard, Icons.Default.Dashboard, "Dashboard"),
                    BottomNavItem(Screen.Orders, Icons.Default.ListAlt, "Orders"),
                    BottomNavItem(Screen.DeskPrinting, Icons.Default.Print, "Desk"),
                    BottomNavItem(Screen.Scanner, Icons.Default.DocumentScanner, "Scanner"),
                    BottomNavItem(Screen.Inventory, Icons.Default.Inventory2, "Inventory"),
                    BottomNavItem(Screen.Settings, Icons.Default.Settings, "Settings"),
                    BottomNavItem(Screen.History, Icons.Default.History, "History")
                )

                Scaffold(
                    topBar = {
                        SmartXeroxTopBar(
                            title = "Smart Xerox Hub",
                            isSyncConnected = true,
                            onRefresh = {
                                coroutineScope.launch {
                                    orderRepo.refreshOrders()
                                    Toast.makeText(this@MainActivity, "Orders synchronized", Toast.LENGTH_SHORT).show()
                                }
                            }
                        )
                    },
                    bottomBar = {
                        NavigationBar(containerColor = SurfaceCard) {
                            bottomNavItems.forEach { item ->
                                NavigationBarItem(
                                    selected = currentRoute == item.screen.route,
                                    onClick = {
                                        if (currentRoute != item.screen.route) {
                                            navController.navigate(item.screen.route) {
                                                popUpTo(Screen.Dashboard.route) { saveState = true }
                                                launchSingleTop = true
                                                restoreState = true
                                            }
                                        }
                                    },
                                    icon = { Icon(item.icon, contentDescription = item.label) },
                                    label = { Text(item.label) }
                                )
                            }
                        }
                    },
                    containerColor = DarkBackground
                ) { innerPadding ->
                    NavHost(
                        navController = navController,
                        startDestination = Screen.Dashboard.route,
                        modifier = Modifier.fillMaxSize().padding(innerPadding)
                    ) {
                        composable(Screen.Dashboard.route) {
                            DashboardScreen(
                                orders = orders,
                                onNavigateToOrders = { navController.navigate(Screen.Orders.route) },
                                onNavigateToDesk = { navController.navigate(Screen.DeskPrinting.route) },
                                onNavigateToScanner = { navController.navigate(Screen.Scanner.route) },
                                onOrderClick = { order ->
                                    navController.navigate(Screen.Orders.route)
                                }
                            )
                        }
                        composable(Screen.Orders.route) {
                            OrdersScreen(
                                orders = orders,
                                onClaimAndPrint = { order ->
                                    orderRepo.claimOrder(order.id, "Android-Admin-Device")
                                },
                                onUpdateStatus = { id, type, action ->
                                    coroutineScope.launch {
                                        orderRepo.updateOrderStatus(id, type, action)
                                    }
                                },
                                onUpdateDuplexStage = { id, stage ->
                                    coroutineScope.launch {
                                        orderRepo.updateDuplexStage(id, stage)
                                    }
                                },
                                onDownloadAndPrint = { order ->
                                    val file = orderRepo.ensureLocalFile(order.fileUrl, order.originalFileName)
                                    if (file != null) {
                                        val opts = PrintJobOptions(
                                            colorMode = order.colorMode,
                                            paperSize = order.paperSize,
                                            paperType = order.paperType,
                                            enableBorder = order.enableBorder,
                                            orientation = order.orientation
                                        )
                                        SmartTankPrintAdapter.launchPrint(this@MainActivity, file, order.orderNumber, opts)
                                    } else {
                                        Toast.makeText(this@MainActivity, "Could not download file for printing", Toast.LENGTH_SHORT).show()
                                    }
                                }
                            )
                        }
                        composable(Screen.DeskPrinting.route) {
                            DeskPrintingScreen()
                        }
                        composable(Screen.Scanner.route) {
                            ScannerScreen()
                        }
                        composable(Screen.Inventory.route) {
                            InventoryScreen()
                        }
                        composable(Screen.Settings.route) {
                            SettingsScreen()
                        }
                        composable(Screen.History.route) {
                            HistoryScreen(orders = orders)
                        }
                    }
                }
            }
        }
    }
}
