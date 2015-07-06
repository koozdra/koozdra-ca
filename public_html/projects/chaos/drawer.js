function Positionable(){
    
    return {
        x: 0,
        y: 0,
        rotate: function(dx, dy){
            var theta = Math.tan(dy-y,dx-x) + d;
            var distance = this.distance(dx,dy);
            var _x = dx + Math.cos(theta) * distance;
            var _y = dy + Math.sin(theta) * distance;

            this.x = _x/scale.x + shift.x;
            this.y = _y/scale.y + shift.y;

            return this;
        }
    };
    
}

function rand_min_max(min,max){
    return Math.floor(Math.random()*(max-min+1)+min);
}

function Drawer(canvas){
    
    var context = canvas.getContext("2d");
    context.globalAlpha = 1;
    
    var id = context.createImageData(1,1); // only do this once per page
    var d  = id.data;                        // only do this once per page
    
    var scale = {x:1, y:1};
    var shift = {x:0, y:0};
    
    return {
        scale: function(x,y){
            scale = {x:x, y:y};
            context.scale(x,y);
        },
        point: function(x,y){
            return {
                distance: function(dx,dy){
                    return Math.sqrt(Math.pow(dx - x, 2),Math.pow(dy - y, 2));
                },
                draw: function(){
                    var size = 1;
                    context.fillStyle = 'rgba(0,0,0,1)';
                    context.fillRect(Math.round(x/scale.x + shift.x), Math.round(y/scale.y + shift.y), size,size);
                },
                draw_raw: function(r,g,b,a){
                    d[0]   = r;
                    d[1]   = g;
                    d[2]   = b;
                    d[3]   = a;

                    context.putImageData( id, x*scale.x + shift.x, y*scale.y + shift.y );     
                },
                scale: function(){
                      
                },
                rotate: function (dx,dy,d){
                    var theta = Math.tan(dy-y,dx-x) + d;
                    var distance = this.distance(dx,dy);
                    var _x = dx + Math.cos(theta) * distance;
                    var _y = dy + Math.sin(theta) * distance;
                    
                    this.x = _x/scale.x + shift.x;
                    this.y = _y/scale.y + shift.y;
                        
                    return this;
                }
            }
        },
        pixel: function(x,y,r,g,b,a){
//            d[0]   = r;
//            d[1]   = g;
//            d[2]   = b;
//            d[3]   = a;
//            
//            context.putImageData( id, x, y );     
            //context.putImageData( id, x*scale.x + shift.x, y*scale.y + shift.y );     
            var size = 1;
            context.fillStyle = 'rgba(0,0,0,1)';
            context.fillRect(Math.round(x/scale.x + shift.x), Math.round(y/scale.y + shift.y), size,size);
            
        },
        line: function(x,y,tx,ty){
            context.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
            context.beginPath();
            context.moveTo(x,y);
            context.lineTo(tx,ty);
            context.stroke();
        },
        surface: function(){
            return {
                center: function(){
                    
                    return {
                        x: (canvas.width/2),
                        y: (canvas.height/2),
                    }
                },
                fill: function(r,g,b,a){
                    context.fillStyle = '#ffffff';
                    context.fillRect(0,0,canvas.width,canvas.height);
                },
                clear: function(){
                    context.fillStyle = '#ffffff';
                    context.fillRect(0,0,canvas.width,canvas.height);
                },
                save_image: function(){
                    var img = canvas.toDataURL("image/png");
                    document.write('<img src="'+img+'"/>');
                }
            }  
        },
        animate: function(f){
            var t = function(){
                //context.clearRect(0,0,canvas.width,canvas.height);
                f();
                window.requestAnimationFrame(t);
            };
            t();
            
        },
        oval: function(x, y, length){
            return {
                
            };
        },
        circle: function(x,y,r){
            
            
            return {
                r: r,
                each_point: function(f){
                     for (i = -r; i < r; i++){
                        var h = Math.sqrt(r*r - i*i);
                        for (j = 0; j <= h; j++){
//                            d.pixel(x + i, y + j , 0, 0, 0, 255);
//                            d.pixel(x + i, y - j , 0, 0, 0, 255);   
                            f(x+i, y+j);
                            f(x+i, y-j);
                        }

                    }
                },
                point_on_radius: function(offset){
                    return {x: x + r * Math.cos(offset), y: y + r * Math.sin(offset)}
                },
                equidistant_points_on_radius: function(num_points, offset){
                    offset = offset || 0;
                    var points = [];
                    var d = Math.PI * 2 / num_points; 
                    for (var i = 0; i < num_points; i++){
                        points.push(this.point_on_radius(offset + d * i));
                    }
                    return points;
                },
                rotate: function(dx, dy){
                    var theta = Math.tan(dy-y,dx-x) + d;
                    var distance = this.distance(dx,dy);
                    var _x = dx + Math.cos(theta) * distance;
                    var _y = dy + Math.sin(theta) * distance;

                    this.x = _x/scale.x + shift.x;
                    this.y = _y/scale.y + shift.y;

                    return this;
                },
                distance: function(dx,dy){
                    return Math.sqrt(Math.pow(dx - x, 2),Math.pow(dy - y, 2));
                },
                draw: function(options){
                    context.beginPath();
                    context.arc(x, y, r, 0, 2*Math.PI, false);
                    context.strokeStyle = "#000000";
                    context.stroke();
                    return this;
                }
            };
            
            _circle
            
            
        }
    }
}

function Actor(x,y,dx,dy){
    return {
        x: x,
        y: y,
        dx: dx,
        dy: dy 
    };
}

function Attractor(x, y, magnitude){
    return {
        x:x,
        y:y,
        magnitude: magnitude
    };
}

function range(min, max){
    return {
        sample: function(){
            
        }
    }
}

var d; 

function run(canvas){
    var lower = 0.5;
    var upper = 1;
    var step = 0.00001;
    var quality = 1;
    
    
    
    d = new Drawer(canvas);
    
    d.surface().fill(255,255,255);
    var t = quality;
    d.scale(t,t);
    
    var attractors = [];
    
    var center = d.surface().center();
    console.log(center)
    var cx = center.x;
    var cy = center.y;
    var radius = 1000;
    var circle = d.circle(cx,cy,radius);
    var num_points = 5;
    var points = circle.equidistant_points_on_radius(num_points, -Math.PI/2);
    
    for (i = 0; i < num_points; i++){
        var p = points[i];
        d.circle(p.x, p.y, 10);
        attractors.push(new Attractor(p.x, p.y, 1));
    }
    
    
    var actors = [];
    
    for (i = 0; i < 1; i++){
        actors.push(new Actor(rand_min_max(0,799),rand_min_max(0,799),0,1));
    }
    
    var runs = 15;
    var run = 0
    var magnitude = 1;
    
    
    
    
    var p = d.point(100,100).rotate(50,100, Math.PI/2);
    
    
    var t = d.circle(200,200,10).draw();
    console.log(t);
    
    t.rotate(100, 200, Math.PI);
    t.draw();
    
    
    d.animate(function(){
        
        
        
        
        //console.log('test');

       
//        var previous_attractor;
//        for (i = 0; i < 100000; i++){
//            
//            
//            
//            
//            
//            magnitude += step;
//            if (magnitude > upper){
//                magnitude = lower;
//            }
//            
//            var actor = actors[rand_min_max(0,actors.length - 1)];
//            var attractor = attractors[rand_min_max(0,attractors.length - 1)];
//            
//            var p = d.point(attractor.x, attractor.y).rotate(cx,cy,Math.PI/2);
//            attractor.x = p.x;
//            attractor.y = p.y;
//            
//            //d.pixel(actor.x,actor.y,255,255,255,255);
////            actor.x += actor.dx;
////            actor.y += actor.dy;
//
//            
////            var dx = actor.x - attractor.x;
////            var dy = actor.y - attractor.y;
//
//            var dx = (attractor.x - actor.x) * magnitude;
//            var dy = (attractor.y - actor.y) * magnitude;
//
//
//            actor.x += dx;
//            actor.y += dy;
//
////            actor.dx = Math.cos((actor.x * actor.x)/(actor.y+1));
////            actor.dy = Math.cos((actor.y * actor.y)/(actor.x+1));
//
////            actor.dx = Math.random() < 0.5 ? 1 : -1;
////            actor.dy = Math.random() < 0.5 ? 1 : -1;
//
////            actor.x = actor.x % canvas.width;
////            actor.y = actor.y % canvas.height;
//
//            
////            // self referential
////            if (previous_attractor){
////                if (previous_attractor == attractor){
////                    d.pixel(actor.x,actor.y,0,0,0,255);        
////                }
////            }
////            previous_attractor = attractor;
//            
//            d.pixel(actor.x,actor.y,0,0,0,1);        
//            
//            
//
//        }
        
        

    });
    
    
//    var data = [];
//    
//    for (i = 0; i < canvas.width; i++){
//        data[i] = [0,1];
//        d.pixel(i,0,0,0,0,255);
//    }
//    
//    
//    d.animate(function(){
//        for (i = 0; i < 5*800; i++){
//            
//            
//            var r = rand_min_max(0,799);
//            d.pixel(r,data[r][0],255,255,255,255);
//            data[r][0] += data[r][1];
//            if (data[r][0] > canvas.height || data[r][0] < 0){
//                data[r][1] = -data[r][1];
//            }
//            d.pixel(r,data[r][0],0,0,0,255);
//        }
//    });
    
}
