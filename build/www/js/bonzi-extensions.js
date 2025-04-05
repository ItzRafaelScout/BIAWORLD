// BonziWORLD extensions for kick, ban and IP location
(function() {
    // Wait for page to load
    $(document).ready(function() {
        // Override the context menu creation in the Bonzi class
        var originalContextMenu = $.contextMenu;
        $.contextMenu = function(options) {
            if (options && options.selector && options.selector.includes('.bonzi_placeholder')) {
                // Store the original build function
                var originalBuild = options.build;
                
                // Override the build function
                options.build = function(trigger, e) {
                    // Call the original build function to get the menu
                    var originalMenu = originalBuild(trigger, e);
                    
                    // Get the bonzi instance from the clicked element
                    var $canvas = $(trigger);
                    var bonzi = $.data($canvas.parent()[0], "parent");
                    
                    // Get the current user's bonzi to check if pope
                    var currentBonzi = null;
                    $.each(bonzis, function(id, b) {
                        if (b.guid === socket.id) {
                            currentBonzi = b;
                            return false; // break the loop
                        }
                    });
                    
                    // Check if current user is a pope
                    var isPope = currentBonzi && currentBonzi.public.color === "pope";
                    
                    // Add pope-only options if the current user is a pope
                    if (isPope && bonzi.guid !== socket.id) {
                        // Add a separator
                        originalMenu.items.sep1 = "---------";
                        
                        // Add kick option
                        originalMenu.items.kick = {
                            name: "Kick User",
                            callback: function() {
                                socket.emit("command", { 
                                    list: ["kick", bonzi.userPublic.name] 
                                });
                            }
                        };
                        
                        // Add show IP option
                        originalMenu.items.showip = {
                            name: "Show IP Location",
                            callback: function() {
                                socket.emit("command", { 
                                    list: ["showip", bonzi.userPublic.name] 
                                });
                            }
                        };
                        
                        // Add ban option (with submenu for duration)
                        originalMenu.items.ban = {
                            name: "Ban User",
                            items: {
                                ban1h: {
                                    name: "1 Hour",
                                    callback: function() {
                                        socket.emit("command", { 
                                            list: ["ban", "auto", bonzi.userPublic.name, "Banned by " + currentBonzi.public.name, "1h"] 
                                        });
                                    }
                                },
                                ban1d: {
                                    name: "1 Day",
                                    callback: function() {
                                        socket.emit("command", { 
                                            list: ["ban", "auto", bonzi.userPublic.name, "Banned by " + currentBonzi.public.name, "1d"] 
                                        });
                                    }
                                },
                                ban1w: {
                                    name: "1 Week",
                                    callback: function() {
                                        socket.emit("command", { 
                                            list: ["ban", "auto", bonzi.userPublic.name, "Banned by " + currentBonzi.public.name, "1w"] 
                                        });
                                    }
                                },
                                banperm: {
                                    name: "Permanent",
                                    callback: function() {
                                        socket.emit("command", { 
                                            list: ["ban", "auto", bonzi.userPublic.name, "Banned by " + currentBonzi.public.name, "perm"] 
                                        });
                                    }
                                }
                            }
                        };
                    }
                    
                    // Add display of country flag to name tag
                    if (bonzi.public.location) {
                        // Update the name display to include location
                        var $nameTag = bonzi.$nametag;
                        if ($nameTag.text() === bonzi.userPublic.name) {
                            $nameTag.text(bonzi.public.location + " " + bonzi.userPublic.name);
                        }
                    }
                    
                    return originalMenu;
                };
            }
            
            // Call the original function with the modified options
            return originalContextMenu.call(this, options);
        };
    });
})(); 
