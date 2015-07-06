function Point(x,y){
  this.x = x;
  this.y = y;
  
  this.rotate = function(center,rotation){
	 var np = this.subtract(center);
	 
	 var theta = Math.atan(y/x) + rotation;
	 
	 if (np.x < 0){
		theta += Math.PI;
	 }
	 
	 var d = Math.sqrt(Math.pow(np.x,2) + Math.pow(np.y,2));
	 
	 // good on right side
	 //return $p(d*Math.cos(theta),d*Math.sin(theta)).add(center);
	 return $p(d*Math.cos(theta),d*Math.sin(theta)).add(center);
  }
  
  this.scale = function(s){
	 //return $p(this.x*s,this.y*y);
	 return $p(this.x*s,this.y*s);
  }
  
  this.shift = function(p){
	 return $p(this.x+p.x,this.y+p.y);
  }
  
  this.subtract = function(p){
	 return $p(this.x - p.x,this.y - p.y);
  }
  
  this.add = function(p){
	 return $p(this.x + p.x,this.y + p.y);
  }
  
  this.duplicate = function(){
	 return $p(x,y);
  } 
  
  this.distance = function(other){
	 var distance = 0;
	 
	 if (other){
		distance = Math.sqrt(Math.pow(this.x-other.x,2) + Math.pow(this.y-other.y,2));
	 }
	 else{
		distance = Math.sqrt(Math.pow(this.x,2) + Math.pow(this.y,2));
	 }
	 
	 return distance;
  }
  
//  this.scale = function(s){
//	 return $p(s*this.x,s*this.y);
//  }
}
function $p(x,y){
  return new Point(x,y)
}




function Color(r,g,b){
  this.r = r;
  this.g = g;
  this.b = b;
  
  
  this.flow = function(c,i){
	 
	 return new Color( Math.floor(((c.r - this.r) * i) + this.r), Math.floor(((c.g - this.g) * i) + this.g), Math.floor(((c.b - this.b) * i) + this.b) );
	 
  }
  
  this.rgb = function(){
	 return 'rgb(' + r + ', ' + g + ', ' + b + ')'
  }
  
}



function ComplexPoint(r, i){
  this.r = r;
  this.i = i;
  
  this.conjugate = function(c){
	 return $cp(c.r,-c.i);
  }
  
//  this.add = function(c){
//	 return $cp(this.r + c.r, this.i + c.i);
//  }

  this.add = function(c){
	 this.r = this.r + c.r;
	 this.i = this.i + c.i;
	 return this;
  }


  this.subtract = function(c){
	 return $cp(this.r - c.r, this.i - c.i);
  }
  
  this.distance = function(){
	 return Math.sqrt(Math.pow(this.r,2) + Math.pow(this.i, 2));
  }
  
  
  this.magnitude = function(){
	 return Math.pow(this.r,2) + Math.pow(this.i, 2);
  }
  
  this.power = function(p){
	 var cp = this.duplicate();
	 
	 var m = cp.duplicate();
	 for (var i = 0; i < p; i ++){
		cp = cp.multiply(m);
	 }
	 
	 return cp;
  }
  
  
  this.duplicate = function(){
	 return $cp(this.r,this.i);
  }
  
//  this.multiply = function(c){
//	 return $cp(this.r * c.r - this.i * c.i, this.i * c.r + this.r * c.i);
//  }
  
  this.multiply = function(c){
	 this.r = this.r * c.r - this.i * c.i;
	 this.i = this.i * c.r + this.r * c.i;
	 return this;
  }
}

function $cp(r,i){
  return new ComplexPoint(r,i)
}




function iterator(array){
  
  this.array = array;
  
  this.each = function(func){
	 for (var i = 0; i < array.length; i++){
		func(array[i], i);
	 }
  }
  
  this.sample = function(){
	 return array[Math.floor(Math.random()*array.length)];
  }
  
  this.find = function(func){
	 for (var i = 0; i < array.length; i++){
		
		if (func(array[i])){
		  return array[i];
		}
	 }
  }
  
}

function $a(array){
  return new iterator(array);
}

function Draw(canvas){
	 this.canvas = canvas;
	 
	 this.context = canvas.getContext('2d');
	 
	 
	 
	 
	 this.paint_style = 'stroke';
	 
	 this._color = 'black';
	 
	 var draw = this;
	 
	 var draw_style = 'stroke';
	 
	 this._scale = 1;
	 this._shift_x = 0;
	 this._shift_y = 0;
	 
	 
	 
	 
	 this._init = function(){
		draw.center_x = draw.canvas.width/2;
		draw.center_y = draw.canvas.height/2;

		draw.context.translate(draw.center_x, draw.center_y);
	 }
	 
	 this._init();
	 
	 
	 $(draw.canvas).keydown(function(event){
		event.stopPropagation();
		
		
		
		if (event.keyCode == 90 && draw.keyboard.z){
			draw.keyboard.z();
		}
		else if(event.keyCode == 40 && draw.keyboard.down){
		  draw.keyboard.down();
		}
	 });
	 
	 this.keyboard = {};
	 
	 this.width = function(x){
		
		
		
		if (x){
		  this.canvas.width = x;
		  
		  this._init();
		  
		}
		
		
		return this.canvas.width;
	 }
	 
	 this.height = function(y){
		
		if (y){
		  this.canvas.height = y;
		  
		  this._init();
		}
		
		return this.canvas.height;
	 }
	 
	 this.origin = function(){
		return $p(0,0);
	 }
	 
	 this.random_point = function(){
		return $p((Math.random()*this.width()) - this.width()/2, (Math.random()*this.height()) - this.height()/2);
	 }
	 
	 /*
	 this.keyboard = {
		z: function(func){
		  
		  
		},
		down: function(func){
		  $(draw.canvas).keypress(function(event){
			 event.stopPropagation();
			 if (event.keyCode == 40){
				 func();
			 }
		  });
		}
	 };
	 */
	 
	 
	 this.color = function(c){
		this._color = c;
		return this;
	 }
	 
	 this.complex_point = function(c){
		//this.fill();
		//this.circle($p(c.r,c.i),1);
		this.point($p(c.r,c.i));
	 }
	 
	 this.fill = function(){
		this.draw_style = 'fill';
		this.context.fillStyle = this._color;
		return this;
	 }
	 
	 this.stroke = function(){
		this.draw_style = 'stroke';
		this.context.strokeStyle = this._color;
		return this;
	 }
	 
	 this._empty_func = function(){};
	 
	 $(this.canvas).click(function(event){
		var offset = $(event.target).offset();
		draw.mouse._click(new Point((event.pageX - offset.left - draw.center_x) * draw._scale, (-(event.pageY - offset.top - draw.center_y)) * draw._scale));
	 });
	 
	 this.mouse = {
		move: function(func){
		  $(canvas).mousemove(function(event){
			 var offset = $(event.target).offset();
			 func($p(event.pageX - offset.left - draw.center_x, -(event.pageY - offset.top - draw.center_y)).scale(draw._scale));
			 
		  });
		},
		leave: function(func){
		  $(canvas).mouseout(function(event){
			 var offset = $(event.target).offset();
			 func(new Point(event.pageX - offset.left - draw.center_x, -(event.pageY - offset.top - draw.center_y)));
			 
		  });
		},
		drag: function(down,move,up){
		  var op = $p(0,1);
		  
		},
		down: function(func){
		  $(canvas).mousedown(function(event){
			 var offset = $(event.target).offset();
			 func($p((event.pageX - offset.left - draw.center_x) * draw._scale, (-(event.pageY - offset.top - draw.center_y)) * draw._scale));
			 
		  });
		},
		up: function(func){
		  $(canvas).mouseup(function(event){
			 var offset = $(event.target).offset();
			 func($p((event.pageX - offset.left - draw.center_x) * draw._scale, (-(event.pageY - offset.top - draw.center_y)) * draw._scale));
			 
		  });
		},
		click: function(func){
		  draw.mouse._click = func;
		},
		_click: draw._empty_func
	 }
	 
	 this.named_color = function(n){
		var color = new Color(0,0,0);
		
		switch(n){
		case 'red':
		  color = new Color(255,0,0);
		  break;
		case 'green':
		  color = new Color(0,255,0);
		  break;
		case 'blue':
		  color = new Color(0,0,255);
		  break;
		case 'yellow':
		  color = new Color(255,255,0);
		  break;
		case 'green':
		  color = new Color(0,255,0);
		  break;
		case 'orange':
		  color = new Color(255,127,0);
		  break;
		case 'indigo':
		  color = new Color(111,0,255);
		  break;
		case 'violet':
		  color = new Color(111,0,255);
		  break;
		case 'black':
		  color = new Color(0,0,0);
		  break;
		case 'white':
		  color = new Color(255,255,255);
		  break;
		
		}
		
		
		
		return color;
	 }
	 
	 this.each_point = function(func){
		for (var y = draw.height()/2; y > -draw.height()/2; y--){
		  for (var x = -draw.width()/2; x < draw.width()/2; x++){
			 func($p(x, y));
		  }
		}
	 }
	 

	 this.times = function(n, func){
		for (var i = 0; i < n; i++){
		  func(i);
		}
	 }
	 
//	 function circle_points(num,x,y,rad,rotation){
//		rotation = rotation || 0;
//
//		var points = [];
//		var angle = 2 * Math.PI/num;
//
//		for (var i = 0; i < num; i++){
//		  points.push([x + Math.cos(rotation + i * angle) * rad, y + Math.sin(rotation + i * angle) * rad]);
//		}
//		return points;
//
//	 }

	 this.circle_points = function(num, center, radius, rotation){
		rotation = rotation || 0;
		
		var points = [];
		var angle = 2 * Math.PI/num;

		for (var i = 0; i < num; i++){
		  points.push($p(center.x + Math.cos(rotation + i * angle) * radius, center.y + Math.sin(rotation + i * angle) * radius));
		}
		return points;
	 }
	 
	 this.clear_all = function(){
		this.context.clearRect(-this.canvas.width/2, -this.canvas.height/2, this.canvas.width, this.canvas.height);
	 }
	 
	 this.rectangle = function(tl,br){
		
		if ('fill' == this.draw_style){
//		  var t = $p(draw.width()/2,draw.height()/2);
//		  var tlt = tl.add(t);
//		  var brt = br.add(t);
		  
		  var tlt = tl;
		  var brt = br;
		  
		  
		  draw.context.fillStyle = this._color;
		  draw.context.fillRect (tlt.x, tlt.y, Math.abs(tlt.x - brt.x), Math.abs(tlt.y - brt.y));
		  
		  this.context.fill();
		}
		else{
		  this
			 .line($p(tl.x,tl.y), $p(br.x,tl.y))
			 .line($p(br.x,tl.y), $p(br.x,br.y))
			 .line($p(br.x,br.y), $p(tl.x,br.y))
			 .line($p(tl.x,br.y), $p(tl.x,tl.y))
			 ;
		}
		
	 }
	 
	 this.point_polar = function(r,theta){
		draw.point($p(r,0).rotate($p(0,0),theta));
	 }
	 
	 this.point = function(p){
		this.context.beginPath(); 
		
		var s = $p(p.x/this._scale +this._shift_x,-p.y/this._scale + this._shift_y);
		
		this.context.moveTo(s.x, s.y); 
		this.context.lineTo(s.x+1, s.y+1); 
		this.context.strokeStyle = this._color;
		this.context.stroke();	
		
//		this.context.restore();
		
		return this;
	 }
	 
	 this.animate = function(func){
		
		func();
		
		var d = this;
		
		
        draw.animLoop = setTimeout(function(){
		  d.animate(func);
		},0);
        
		
		return this;
	 }
     
     this.animate_while = function(func, whileCondition){
        
        func();
        var d = this;
        if (whileCondition()){
            window.requestAnimationFrame(function(){d.animate_while(func, whileCondition)})
        }
         
        return this;
     }
     
     this.stop_animation = function(){
         
         clearTimeout(draw.animLoop);
     }
	 
	 this.line = function(p1,p2){
		this.context.beginPath(); 
		
//		this.context.save();
		
		
		this.context.moveTo(p1.x/this._scale, -p1.y/this._scale); 
		this.context.lineTo(p2.x/this._scale, -p2.y/this._scale); 
		
		
		
		this.context.stroke();	
		
		
//		this.context.restore();
		
		return this;
	 }
	 
	 this.screen = {
		tl: function(){
		  return $p(-((draw.width()/2) * draw.scale()) + draw._shift_x,((draw.width()/2) * draw.scale()  + draw._shift_x));
		},
		br: function(){
		  return $p(((draw.width()/2) * draw.scale()) + draw._shift_x,-((draw.width()/2) * draw.scale() + draw._shift_y));
		},
		shift: function(x,y){
		  draw._shift_x += x;
		  draw._shift_y += y;
		}
	 }
	 
	 
	 
	 this.render = {
		on_render_complete: function(func){
		  draw._on_render_complete = func;
		},
		in_rows: function(func){
		  
		  draw.render._in_rows_y = draw.height()/2;
		  draw.render._draw_rows(func);
		  
		  return draw;
		},
		_draw_rows: function(func){
		  for (var x = -draw.width()/2; x < draw.width()/2; x++){
			 func($p(x, draw.render._in_rows_y));
		  }
		  
		  draw.render._in_rows_y -= 1;
		  
		  if (draw.render._in_rows_y > -draw.height()/2){
			 setTimeout(function(){
				draw.render._draw_rows(func);
			 },0);
		  }
		  else{
			 if (draw._on_render_complete) draw._on_render_complete();
		  }
		  
		},
		center_out: function(func){
		  draw.render._center_out_n = 1;
		  draw.render._center_out_dir = 0;
		  draw.render._center_out_x = 0;
		  draw.render._center_out_y = 0;
		  
		  draw.render._directions = [[1,0],[0,-1],[-1,0],[0,1]];
		  
		  
		  draw.render._center_out_limit = Math.min(draw.width()/2,draw.height()/2);
		  
		  draw.render._center_out(func);
		  
		  return draw;
		},
		_center_out: function(func){
		  
		  
		  
		  
		  for (var t = 0; t < 4; t++){
			 
			 var dir = draw.render._directions[draw.render._center_out_dir % draw.render._directions.length];
			 
			 for (var i = 0; i < Math.floor((draw.render._center_out_n+1)/2); i++){
				func($p(draw.render._center_out_x, draw.render._center_out_y + 0.5));
				draw.render._center_out_x += dir[0];
				draw.render._center_out_y += dir[1];
			 }


			 draw.render._center_out_n += 1;
			 draw.render._center_out_dir += 1;
		  }
		  
		  
		  var limit = draw.render._center_out_limit;
		  
		  if (Math.abs(draw.render._center_out_x) <= limit && Math.abs(draw.render._center_out_y) <= limit){
			 setTimeout(function(){
				draw.render._center_out(func);
			 },0);
		  }
		  
		  
		}
		
		
	 };
	 
	 this.scale = function(s){
		if (s){
			this._scale = s;
		}
		return this._scale;
	 }
	 
	 this.points_in_rectangle = function(tl,br,step,func){
		for (var y = tl.y; y > br.y; y -= step){
		  for (var x = tl.x; x < br.x; x+= step){
			 func(x,y);
		  }
		}
	 }
	 
//	 this.circle_points = function(c, r, func){
//		var f = 1 - r;
//		var ddF_x = 1;
//		var ddF_y = -2 * r;
//		
//		var x = 0;
//		var y = r;
//		
//		func($p(c.x, c.y + r));
//		func($p(c.x, c.y - r));
//		func($p(c.x + r, c.y));
//		func($p(c.x - r, c.y));
//		
//		
//		while (x < y) {
//		  
//		  if(f >= 0){
//			 y--;
//			 ddF_y += 2;
//			 f += ddF_y;
//		  }
//		  x++;
//		  ddF_x += 2;
//		  f += ddF_x;  
//		  
//		  func($p(c.x + x, c.y + y));
//		  func($p(c.x + x, c.y - y));
//		  func($p(c.x - x, c.y + y));
//		  func($p(c.x - x, c.y - y));
//		  
//		  func($p(c.x + y, c.y + x));
//		  func($p(c.x + y, c.y - x));
//		  func($p(c.x - y, c.y - x));
//		  func($p(c.x - y, c.y + x));
//		  
//		}
//		
//		
//	 }
	 
	 this.distance = function(x,y,to_x,to_y){
		return Math.sqrt(Math.pow(x-to_x,2) + Math.pow(y-to_y,2));
	 }
	 
	 this.save_image = function(){
		var img = this.canvas.toDataURL("image/png");
		document.write('<img src="'+img+'"/>');
	 }
	 
	 
	 this.circle = function(p,r){
		
		this.arc(p.x, p.y, r, 0, Math.PI*2);
		return this;
	 }
	 
	 this.arc = function(x, y, r, start, end){
		
		this.context.beginPath();
		
		this.context.arc(x, -y, r, start, end, true);
		
		if ('fill' == this.draw_style){
		  this.context.fill();
		}
		else{
		  this.context.stroke();	
		}
		
		return this;
	 }
	 
	 this.is_in_triangle = function(p,a,b,c){
		
		//credit: http://www.blackpawn.com/texts/pointinpoly/default.html
		
		var v0 = [c.x-a.x,c.y-a.y];
		var v1 = [b.x-a.x,b.y-a.y];
		var v2 = [p.x-a.x,p.y-a.y];
		  
		var dot00 = (v0[0]*v0[0]) + (v0[1]*v0[1]);
		var dot01 = (v0[0]*v1[0]) + (v0[1]*v1[1]);
		var dot02 = (v0[0]*v2[0]) + (v0[1]*v2[1]);
		var dot11 = (v1[0]*v1[0]) + (v1[1]*v1[1]);
		var dot12 = (v1[0]*v2[0]) + (v1[1]*v2[1]);
		  
		var invDenom = 1/ (dot00 * dot11 - dot01 * dot01);
		  
		var u = (dot11 * dot02 - dot01 * dot12) * invDenom;
		var v = (dot00 * dot12 - dot01 * dot02) * invDenom;

		return ((u >= 0) && (v >= 0) && (u + v < 1));
	 }
	 
	 
	 this.point_hex_arc = function(p,d){
		
		var ry = Math.floor(p.y/(d*Math.sqrt(3/4)));		  
		var rx = Math.floor((p.x - (p.y / Math.sqrt(3)))/d);

		var rox = (rx * d) + ((d / 2) * ry);
		var roy = ry * d * Math.sqrt(3/4);

		var rhombic_points = [
		  $p(rox+d*0,roy+d*0), 
		  $p(rox+d*1/2,roy+d*1/(2*Math.sqrt(3))), 
		  $p(rox+d*1/2,roy+d*Math.sqrt(3)/2), 
		  $p(rox+d*1,roy+d*0), 
		  $p(rox+d*1,roy+d*1/Math.sqrt(3)), 
		  $p(rox+d*3/2,roy+d*Math.sqrt(3)/2)
		];

		var i = 0;
		
		if (this.is_in_triangle(p,rhombic_points[0],rhombic_points[2],rhombic_points[3])){
		  if (this.is_in_triangle(p,rhombic_points[1],rhombic_points[2],rhombic_points[3])){
			 i = 2;
		  }
		  else if (this.is_in_triangle(p,rhombic_points[0],rhombic_points[1],rhombic_points[2])){
			 i = 0;
		  }
		  else{
			 i = 1;
		  }
		}
		else{
		  if (this.is_in_triangle(p,rhombic_points[2],rhombic_points[3],rhombic_points[4])){
			 i = 3;
		  }
		  else if (this.is_in_triangle(p,rhombic_points[3],rhombic_points[4],rhombic_points[5])){
			 i = 4;
		  }
		  else{
			 this.hex_arc(rx,ry,5,d);
			 i = 5;
		  }
		}
		
		this.hex_arc(rx,ry,i,d)

	 }
	 
	 this.origin = function(){
		return $p(0,0);
	 }
	 
	 this.points = function(){
		return {
		  top_left: function(){
			 return $p(-draw.width()/2, -draw.height()/2);
		  },
		  top_right: function(){
			 return $p(draw.width()/2, -draw.height()/2);
		  },
		  bottom_left: function(){
			 return $p(-draw.width()/2, draw.height()/2);
		  },
		  bottom_right: function(){
			 return $p(draw.width()/2, draw.height()/2);
		  }
		};
	 }
	 
	 
	 this.hex_arc = function(x,y,i,d){
		
		x *= d;
		x += (d/2)*y;
		y *= d * Math.sqrt(3/4);
		
		
		switch (i) {
		  case 0:
			 this.arc(x - (d / 2), y + d * Math.sqrt(3/4), d, -5 * Math.PI/3, -6 * Math.PI/3);
			 break;
		  case 1:
			 this.arc(x + (d / 2), y - (d * Math.sqrt(3/4)), d, - Math.PI/3, -2 * Math.PI/3);
			 break;		  
		  case 2:
			 this.arc(x + (d * 3 / 2), y + d * Math.sqrt(3/4), d, -3 * Math.PI/3, -4 * Math.PI/3);
			 break;
		  case 3:
			 this.arc(x, y, d, 0, -Math.PI/3);
			 break;
		  case 4:
			 this.arc(x + (d * 2), y, d, -2 * Math.PI/3, -3 * Math.PI/3);
			 break;
		  case 5:
			 this.arc(x + d, y + (d * 2 * Math.sqrt(3/4)), d, -4 * Math.PI/3, -5 * Math.PI/3);
			 break;
		}
		
	 }
	 
};
